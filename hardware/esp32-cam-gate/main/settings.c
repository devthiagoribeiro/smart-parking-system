#include "settings.h"
#include <string.h>
#include "app_config.h"
#include "esp_log.h"
#include "nvs.h"
#include "sdkconfig.h"

static const char *TAG = "settings";
static const char *NS = "gate";
static settings_t s_cur;

void settings_load(void)
{
    strncpy(s_cur.server_url, CONFIG_GATE_SERVER_URL, sizeof(s_cur.server_url) - 1);
    s_cur.move_ms = SERVO_MOVE_MS;
    s_cur.open_dir = SERVO_OPEN_DIR;

    nvs_handle_t h;
    if (nvs_open(NS, NVS_READONLY, &h) == ESP_OK) {
        size_t len = sizeof(s_cur.server_url);
        nvs_get_str(h, "url", s_cur.server_url, &len);
        int32_t v;
        if (nvs_get_i32(h, "move_ms", &v) == ESP_OK) s_cur.move_ms = v;
        if (nvs_get_i32(h, "dir", &v) == ESP_OK) s_cur.open_dir = v;
        nvs_close(h);
    }
    ESP_LOGI(TAG, "servidor=%s giro=%dms dir=%d", s_cur.server_url, s_cur.move_ms,
             s_cur.open_dir);
}

const settings_t *settings_get(void)
{
    return &s_cur;
}

esp_err_t settings_save(const settings_t *s)
{
    nvs_handle_t h;
    esp_err_t err = nvs_open(NS, NVS_READWRITE, &h);
    if (err != ESP_OK) return err;
    nvs_set_str(h, "url", s->server_url);
    nvs_set_i32(h, "move_ms", s->move_ms);
    nvs_set_i32(h, "dir", s->open_dir);
    err = nvs_commit(h);
    nvs_close(h);
    if (err == ESP_OK) {
        s_cur = *s;
        ESP_LOGI(TAG, "salvo: servidor=%s giro=%dms dir=%d", s_cur.server_url,
                 s_cur.move_ms, s_cur.open_dir);
    }
    return err;
}
