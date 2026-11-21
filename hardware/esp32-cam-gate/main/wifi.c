#include "wifi.h"
#include <string.h>
#include "app_config.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"

static const char *TAG = "wifi";
#define CONNECTED_BIT BIT0

#define FAILS_BEFORE_SWITCH 3

typedef struct {
    const char *ssid;
    const char *pass;
} net_t;

// Rede principal e reserva (menuconfig). Alterna entre elas quando uma falha.
static const net_t s_nets[] = {
    {CONFIG_GATE_WIFI_SSID, CONFIG_GATE_WIFI_PASSWORD},
    {CONFIG_GATE_WIFI2_SSID, CONFIG_GATE_WIFI2_PASSWORD},
};

static EventGroupHandle_t s_events;
static esp_timer_handle_t s_retry_timer;
static int s_net_count = 1;
static int s_net_idx;
static int s_fails;

static void apply_net(int idx)
{
    wifi_config_t wc = {0};
    strncpy((char *)wc.sta.ssid, s_nets[idx].ssid, sizeof(wc.sta.ssid) - 1);
    strncpy((char *)wc.sta.password, s_nets[idx].pass, sizeof(wc.sta.password) - 1);
    esp_wifi_set_config(WIFI_IF_STA, &wc);
    ESP_LOGI(TAG, "conectando em \"%s\"...", s_nets[idx].ssid);
}

static void retry_cb(void *arg)
{
    if (s_net_count > 1 && ++s_fails >= FAILS_BEFORE_SWITCH) {
        s_fails = 0;
        s_net_idx = (s_net_idx + 1) % s_net_count;
        apply_net(s_net_idx);
    }
    esp_wifi_connect();
}

static void on_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        wifi_event_sta_disconnected_t *d = data;
        if (xEventGroupGetBits(s_events) & CONNECTED_BIT) {
            ESP_LOGW(TAG, "conexão perdida");
        }
        xEventGroupClearBits(s_events, CONNECTED_BIT);
        ESP_LOGW(TAG, "desconectado (motivo %d), nova tentativa em %d ms",
                 d->reason, WIFI_RETRY_MS);
        esp_timer_stop(s_retry_timer);
        esp_timer_start_once(s_retry_timer, (uint64_t)WIFI_RETRY_MS * 1000);
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *e = data;
        wifi_ap_record_t ap;
        int rssi = esp_wifi_sta_get_ap_info(&ap) == ESP_OK ? ap.rssi : 0;
        s_fails = 0;
        ESP_LOGI(TAG, "conectado em \"%s\", IP " IPSTR ", RSSI %d dBm", s_nets[s_net_idx].ssid,
                 IP2STR(&e->ip_info.ip), rssi);
        ESP_LOGI(TAG, ">>> câmera no navegador: http://" IPSTR "/", IP2STR(&e->ip_info.ip));
        xEventGroupSetBits(s_events, CONNECTED_BIT);
    }
}

void wifi_start(void)
{
    s_events = xEventGroupCreate();
    const esp_timer_create_args_t targs = {.callback = retry_cb, .name = "wifi_retry"};
    ESP_ERROR_CHECK(esp_timer_create(&targs, &s_retry_timer));

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, on_event, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, on_event, NULL));

    if (strlen(CONFIG_GATE_WIFI2_SSID) > 0) s_net_count = 2;

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    apply_net(0);
    ESP_ERROR_CHECK(esp_wifi_start());
    esp_wifi_set_ps(WIFI_PS_NONE);   // latência menor no upload
}

bool wifi_is_connected(void)
{
    return xEventGroupGetBits(s_events) & CONNECTED_BIT;
}

bool wifi_wait_connected(uint32_t timeout_ms)
{
    EventBits_t b = xEventGroupWaitBits(s_events, CONNECTED_BIT, pdFALSE, pdTRUE,
                                        pdMS_TO_TICKS(timeout_ms));
    return b & CONNECTED_BIT;
}
