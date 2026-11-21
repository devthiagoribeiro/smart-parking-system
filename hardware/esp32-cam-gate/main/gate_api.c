#include "gate_api.h"
#include <ctype.h>
#include <stdio.h>
#include <string.h>
#include "app_config.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sdkconfig.h"
#include "settings.h"
#include "wifi.h"

static const char *TAG = "api";

// Lê o valor de "key" num JSON simples (string sem aspas, true/false/número).
static bool json_value(const char *body, const char *key, char *out, size_t out_len)
{
    char pattern[40];
    snprintf(pattern, sizeof(pattern), "\"%s\"", key);
    const char *p = strstr(body, pattern);
    if (!p) return false;
    p = strchr(p + strlen(pattern), ':');
    if (!p) return false;
    p++;
    while (*p && isspace((unsigned char)*p)) p++;

    const char *end;
    if (*p == '"') {
        p++;
        end = strchr(p, '"');
        if (!end) return false;
    } else {
        end = p;
        while (*end && *end != ',' && *end != '}' && !isspace((unsigned char)*end)) end++;
    }
    size_t n = (size_t)(end - p);
    if (n >= out_len) n = out_len - 1;
    memcpy(out, p, n);
    out[n] = '\0';
    return true;
}

static int write_all(esp_http_client_handle_t c, const uint8_t *buf, size_t len)
{
    size_t sent = 0;
    while (sent < len) {
        int w = esp_http_client_write(c, (const char *)buf + sent, len - sent);
        if (w <= 0) return -1;
        sent += w;
    }
    return (int)sent;
}

auth_result_t gate_api_authorize(const uint8_t *jpg, size_t len, auth_info_t *info)
{
    memset(info, 0, sizeof(*info));

    for (int attempt = 1; attempt <= UPLOAD_RETRIES; attempt++) {
        if (attempt > 1) vTaskDelay(pdMS_TO_TICKS(UPLOAD_BACKOFF_MS * (attempt - 1)));

        if (!wifi_wait_connected(3000)) {
            ESP_LOGW(TAG, "sem Wi-Fi (tentativa %d/%d)", attempt, UPLOAD_RETRIES);
            snprintf(info->reason, sizeof(info->reason), "wifi_offline");
            continue;
        }

        char url[sizeof(settings_get()->server_url)];
        strlcpy(url, settings_get()->server_url, sizeof(url));
        esp_http_client_config_t cfg = {
            .url = url,
            .method = HTTP_METHOD_POST,
            .timeout_ms = HTTP_TIMEOUT_MS,
        };
        esp_http_client_handle_t c = esp_http_client_init(&cfg);
        esp_http_client_set_header(c, "Content-Type", "image/jpeg");
        esp_http_client_set_header(c, "X-Device-Id", CONFIG_GATE_DEVICE_ID);
        if (strlen(CONFIG_GATE_API_KEY) > 0) {
            esp_http_client_set_header(c, "X-Api-Key", CONFIG_GATE_API_KEY);
        }

        int64_t t0 = esp_timer_get_time();
        esp_err_t err = esp_http_client_open(c, len);
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "tentativa %d/%d: conexão falhou (%s)",
                     attempt, UPLOAD_RETRIES, esp_err_to_name(err));
            snprintf(info->reason, sizeof(info->reason), "connect_failed");
            esp_http_client_cleanup(c);
            continue;
        }
        if (write_all(c, jpg, len) < 0) {
            ESP_LOGW(TAG, "tentativa %d/%d: envio interrompido", attempt, UPLOAD_RETRIES);
            snprintf(info->reason, sizeof(info->reason), "write_failed");
            esp_http_client_close(c);
            esp_http_client_cleanup(c);
            continue;
        }

        int status = -1;
        char body[512] = {0};
        if (esp_http_client_fetch_headers(c) >= 0) {
            status = esp_http_client_get_status_code(c);
            int n = esp_http_client_read_response(c, body, sizeof(body) - 1);
            body[n > 0 ? n : 0] = '\0';
        }
        esp_http_client_close(c);
        esp_http_client_cleanup(c);
        ESP_LOGI(TAG, "tentativa %d/%d -> HTTP %d em %lld ms",
                 attempt, UPLOAD_RETRIES, status, (esp_timer_get_time() - t0) / 1000);

        if (status == 200) {
            ESP_LOGI(TAG, "resposta: %s", body);
            char authorized[8] = "";
            json_value(body, "authorized", authorized, sizeof(authorized));
            json_value(body, "plate", info->plate, sizeof(info->plate));
            json_value(body, "reason", info->reason, sizeof(info->reason));
            return strcmp(authorized, "true") == 0 ? AUTH_OK : AUTH_DENIED;
        }
        if (status >= 400 && status < 500) {
            // Erro do cliente (formato, chave): repetir não resolve
            ESP_LOGW(TAG, "rejeitado: %s", body);
            snprintf(info->reason, sizeof(info->reason), "http_%d", status);
            return AUTH_ERROR;
        }
        if (status < 0) {
            snprintf(info->reason, sizeof(info->reason), "no_response");
        } else {
            snprintf(info->reason, sizeof(info->reason), "http_%d", status);
        }
    }
    return AUTH_ERROR;
}
