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

#define BOUNDARY "----esp32camGateBoundary7MA4YWxkTrZu0gW"
static const char MP_HEAD[] =
    "--" BOUNDARY "\r\n"
    "Content-Disposition: form-data; name=\"image\"; filename=\"placa.jpg\"\r\n"
    "Content-Type: image/jpeg\r\n\r\n";
static const char MP_TAIL[] = "\r\n--" BOUNDARY "--\r\n";

// Lê o valor de "key" num JSON simples (string sem aspas, true/false/número/null).
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

// Interpreta a resposta 200. Aceita o formato da API do time
// ({"success", "plate", "saldo", "tipo"}) e o formato antigo do servidor de
// teste ({"authorized", "plate", "reason"}).
static auth_result_t parse_ok(const char *body, auth_info_t *info)
{
    char flag[8] = "";
    json_value(body, "plate", info->plate, sizeof(info->plate));
    if (strcmp(info->plate, "null") == 0) info->plate[0] = '\0';
    json_value(body, "tipo", info->tipo, sizeof(info->tipo));
    json_value(body, "saldo", info->saldo, sizeof(info->saldo));

    if (json_value(body, "authorized", flag, sizeof(flag))) {
        json_value(body, "reason", info->reason, sizeof(info->reason));
        return strcmp(flag, "true") == 0 ? AUTH_OK : AUTH_DENIED;
    }
    if (json_value(body, "success", flag, sizeof(flag)) && strcmp(flag, "true") == 0) {
        snprintf(info->reason, sizeof(info->reason), "ok");
        return AUTH_OK;
    }
    snprintf(info->reason, sizeof(info->reason), "placa_nao_reconhecida");
    return AUTH_DENIED;
}

auth_result_t gate_api_authorize(const uint8_t *jpg, size_t len, auth_info_t *info)
{
    memset(info, 0, sizeof(*info));
    const size_t head_len = sizeof(MP_HEAD) - 1;
    const size_t tail_len = sizeof(MP_TAIL) - 1;
    const int total = (int)(head_len + len + tail_len);

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
        esp_http_client_set_header(c, "Content-Type", "multipart/form-data; boundary=" BOUNDARY);
        esp_http_client_set_header(c, "X-Device-Id", CONFIG_GATE_DEVICE_ID);
        if (strlen(CONFIG_GATE_API_KEY) > 0) {
            esp_http_client_set_header(c, "X-Api-Key", CONFIG_GATE_API_KEY);
        }

        int64_t t0 = esp_timer_get_time();
        esp_err_t err = esp_http_client_open(c, total);
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "tentativa %d/%d: conexão falhou (%s)", attempt, UPLOAD_RETRIES,
                     esp_err_to_name(err));
            snprintf(info->reason, sizeof(info->reason), "servidor_inacessivel");
            esp_http_client_cleanup(c);
            continue;   // nada foi enviado: seguro repetir
        }
        if (write_all(c, (const uint8_t *)MP_HEAD, head_len) < 0 || write_all(c, jpg, len) < 0 ||
            write_all(c, (const uint8_t *)MP_TAIL, tail_len) < 0) {
            ESP_LOGW(TAG, "tentativa %d/%d: envio interrompido", attempt, UPLOAD_RETRIES);
            snprintf(info->reason, sizeof(info->reason), "envio_interrompido");
            esp_http_client_close(c);
            esp_http_client_cleanup(c);
            continue;   // a foto não chegou inteira: a API não processa
        }

        // A partir daqui a foto foi entregue: NÃO repetir (evita entrada/saída em dobro).
        int status = -1;
        char body[512] = {0};
        if (esp_http_client_fetch_headers(c) >= 0) {
            status = esp_http_client_get_status_code(c);
            int n = esp_http_client_read_response(c, body, sizeof(body) - 1);
            body[n > 0 ? n : 0] = '\0';
        }
        esp_http_client_close(c);
        esp_http_client_cleanup(c);
        ESP_LOGI(TAG, "HTTP %d em %lld ms: %s", status, (esp_timer_get_time() - t0) / 1000, body);

        if (status == 200) return parse_ok(body, info);
        if (status == 400) {
            // API do time: saída com saldo insuficiente
            if (!json_value(body, "detail", info->reason, sizeof(info->reason))) {
                snprintf(info->reason, sizeof(info->reason), "recusado");
            }
            return AUTH_DENIED;
        }
        if (status < 0) {
            snprintf(info->reason, sizeof(info->reason), "sem_resposta");
        } else {
            snprintf(info->reason, sizeof(info->reason), "http_%d", status);
        }
        return AUTH_ERROR;
    }
    return AUTH_ERROR;
}
