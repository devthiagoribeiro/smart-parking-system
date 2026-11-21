// Smart Parking - nó de entrada (ESP32-CAM AI-Thinker, ESP-IDF)
//
// Fluxo: HC-SR04 detecta carro -> foto da placa -> POST JPEG ao servidor
//        -> {"authorized": true|false} -> abre a cancela -> carro passa -> fecha.
//
// Comandos no monitor serial: p x o c f d s ?  (ver print_help)

#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include "app_config.h"
#include "camera_ctl.h"
#include "driver/gpio.h"
#include "driver/uart.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "gate_api.h"
#include "nvs_flash.h"
#include "sdkconfig.h"
#include "servo.h"
#include "settings.h"
#include "ultrasonic.h"
#include "web.h"
#include "wifi.h"

static const char *TAG = "gate";

typedef enum { ST_IDLE, ST_CAPTURING, ST_GATE_OPEN, ST_DENIED } state_t;
static const char *STATE_NAMES[] = {"IDLE", "CAPTURING", "GATE_OPEN", "DENIED"};

static state_t s_state = ST_IDLE;
static uint32_t s_state_since;
static int s_attempts;
static bool s_camera_ok;
static auth_info_t s_last;

// Presença: debounce assimétrico sobre a mediana das leituras
static bool s_sim_present;
static bool s_present;           // estado estável
static bool s_raw_last;
static uint32_t s_raw_since, s_present_since;
static float s_distance_cm = -1;
#if CONFIG_GATE_USE_ULTRASONIC
static float s_window[US_WINDOW];
static int s_win_idx, s_win_count;
static uint32_t s_last_sample;
#endif

static inline uint32_t now_ms(void)
{
    return (uint32_t)(esp_timer_get_time() / 1000);
}

// ---------------------------------------------------------------------------
// LEDs
// ---------------------------------------------------------------------------
static void set_led(bool red, bool green)
{
    gpio_set_level(PIN_LED_RED, red);
    gpio_set_level(PIN_LED_GREEN, green);
}

static void update_status_led(void)
{
    uint32_t t = now_ms();
    switch (s_state) {
    case ST_IDLE:
        if (!wifi_is_connected()) {      // os dois piscando juntos = sem Wi-Fi
            bool on = (t / 500) % 2;
            set_led(on, on);
        } else {
            set_led(false, false);
        }
        break;
    case ST_CAPTURING: set_led(true, true); break;               // os dois acesos
    case ST_GATE_OPEN: set_led(false, true); break;              // verde
    case ST_DENIED:    set_led((t / 250) % 2, false); break;     // vermelho piscando
    }
}

static void leds_init(void)
{
    gpio_reset_pin(PIN_LED_RED);
    gpio_set_direction(PIN_LED_RED, GPIO_MODE_OUTPUT);
    gpio_reset_pin(PIN_LED_GREEN);
    gpio_set_direction(PIN_LED_GREEN, GPIO_MODE_OUTPUT);
    set_led(false, false);
}

// ---------------------------------------------------------------------------
// Presença
// ---------------------------------------------------------------------------
#if CONFIG_GATE_USE_ULTRASONIC
static float median(const float *v, int n)
{
    float tmp[US_WINDOW];
    memcpy(tmp, v, n * sizeof(float));
    for (int i = 1; i < n; i++) {
        float k = tmp[i];
        int j = i - 1;
        while (j >= 0 && tmp[j] > k) { tmp[j + 1] = tmp[j]; j--; }
        tmp[j + 1] = k;
    }
    return tmp[n / 2];
}
#endif

static bool read_raw_presence(void)
{
#if CONFIG_GATE_USE_ULTRASONIC
    uint32_t t = now_ms();
    if (t - s_last_sample >= US_SAMPLE_MS) {
        s_last_sample = t;
        float d = ultrasonic_read_cm();
        s_window[s_win_idx] = d < 0 ? 9999 : d;
        s_win_idx = (s_win_idx + 1) % US_WINDOW;
        if (s_win_count < US_WINDOW) s_win_count++;
        s_distance_cm = median(s_window, s_win_count);
    }
    return s_win_count > 0 && s_distance_cm > 2 && s_distance_cm < PRESENCE_CM;
#else
    return s_sim_present;
#endif
}

static void update_presence(void)
{
    uint32_t t = now_ms();
    bool raw = read_raw_presence();
    if (raw != s_raw_last) {
        s_raw_last = raw;
        s_raw_since = t;
    }
    uint32_t need = raw ? PRESENCE_CONFIRM_MS : CLEAR_CONFIRM_MS;
    if (raw != s_present && t - s_raw_since >= need) {
        s_present = raw;
        s_present_since = t;
        ESP_LOGI(TAG, "%s (dist=%.1f cm)", s_present ? "carro detectado" : "area livre",
                 s_distance_cm);
    }
}

// ---------------------------------------------------------------------------
// Captura + autorização
// ---------------------------------------------------------------------------
static auth_result_t capture_and_authorize(void)
{
    memset(&s_last, 0, sizeof(s_last));
    if (!s_camera_ok) {
        snprintf(s_last.reason, sizeof(s_last.reason), "camera_error");
        return AUTH_ERROR;
    }
    camera_fb_t *fb = camera_ctl_capture();
    if (!fb) {
        snprintf(s_last.reason, sizeof(s_last.reason), "capture_failed");
        return AUTH_ERROR;
    }
    auth_result_t r = gate_api_authorize(fb->buf, fb->len, &s_last);
    camera_ctl_release(fb);
    return r;
}

static void open_gate(void)  { ESP_LOGI(TAG, "abrindo cancela");  servo_open(); }
static void close_gate(void) { ESP_LOGI(TAG, "fechando cancela"); servo_close(); }

// ---------------------------------------------------------------------------
// Máquina de estados
// ---------------------------------------------------------------------------
static void set_state(state_t s)
{
    if (s == s_state) return;
    ESP_LOGI(TAG, "%s -> %s", STATE_NAMES[s_state], STATE_NAMES[s]);
    s_state = s;
    s_state_since = now_ms();
}

static void run_state_machine(void)
{
    uint32_t t = now_ms();
    switch (s_state) {
    case ST_IDLE:
        if (s_present) {
            s_attempts = 0;
            set_state(ST_CAPTURING);
        }
        break;

    case ST_CAPTURING: {
        s_attempts++;
        update_status_led();
        ESP_LOGI(TAG, "tentativa %d/%d", s_attempts, MAX_ATTEMPTS);
        auth_result_t r = capture_and_authorize();
        if (r == AUTH_OK) {
            ESP_LOGI(TAG, "LIBERADO placa=%s tipo=%s saldo=%s", s_last.plate, s_last.tipo,
                     s_last.saldo);
            set_state(ST_GATE_OPEN);
            update_status_led();
            open_gate();
        } else {
            ESP_LOGW(TAG, "%s placa=%s motivo=%s", r == AUTH_DENIED ? "NEGADO" : "ERRO",
                     s_last.plate, s_last.reason);
            set_state(ST_DENIED);
        }
        break;
    }

    case ST_GATE_OPEN: {
        // Fecha quando o carro saiu da frente do sensor há CLOSE_DELAY_MS,
        // ou por segurança depois de GATE_MAX_OPEN_MS.
        bool passed = !s_present && t - s_present_since >= CLOSE_DELAY_MS;
        bool timeout = t - s_state_since >= GATE_MAX_OPEN_MS;
        if (passed || timeout) {
            if (timeout && s_present) ESP_LOGW(TAG, "timeout com carro presente!");
            close_gate();
            set_state(ST_IDLE);
        }
        break;
    }

    case ST_DENIED:
        // Só rearma depois que o carro sair: evita disparos repetidos.
        if (!s_present) {
            set_state(ST_IDLE);
        } else if (s_attempts < MAX_ATTEMPTS && t - s_state_since >= RETRY_DELAY_MS) {
            set_state(ST_CAPTURING);
        }
        break;
    }
}

// ---------------------------------------------------------------------------
// Console (testes sem sensor)
// ---------------------------------------------------------------------------
static void print_help(void)
{
    printf("\nComandos:\n"
           "  p  simula carro chegando (sensor desligado no menuconfig)\n"
           "  x  simula carro saindo\n"
           "  o  abre a cancela    c  fecha a cancela\n"
           "  +  / -  aumenta / diminui o tempo de giro do servo 360 (50 ms)\n"
           "  f  tira foto e envia ao servidor (sem mexer na cancela)\n"
           "  d  mede distância no ultrassônico\n"
           "  s  status\n"
           "  ?  ajuda\n\n");
}

static void handle_console(void)
{
    uint8_t ch;
    while (uart_read_bytes(UART_NUM_0, &ch, 1, 0) == 1) {
        switch (ch) {
        case 'p': s_sim_present = true;  ESP_LOGI(TAG, "[sim] carro presente"); break;
        case 'x': s_sim_present = false; ESP_LOGI(TAG, "[sim] carro saiu"); break;
        case 'o': open_gate(); break;
        case 'c': close_gate(); break;
        case '+': servo_adjust_move_ms(+50); break;
        case '-': servo_adjust_move_ms(-50); break;
        case 'f': {
            auth_result_t r = capture_and_authorize();
            ESP_LOGI(TAG, "[teste] resultado=%d placa=%s motivo=%s", r, s_last.plate,
                     s_last.reason);
            break;
        }
        case 'd':
            ESP_LOGI(TAG, "distância: única=%.1f cm, mediana=%.1f cm", ultrasonic_read_cm(),
                     s_distance_cm);
            break;
        case 's':
            ESP_LOGI(TAG, "estado=%s presente=%d wifi=%d cancela=%s giro=%dms heap=%u psram=%u",
                     STATE_NAMES[s_state], s_present, wifi_is_connected(),
                     servo_is_open() ? "aberta" : "fechada", servo_move_ms(),
                     (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL),
                     (unsigned)heap_caps_get_free_size(MALLOC_CAP_SPIRAM));
            break;
        case '?': print_help(); break;
        default: break;
        }
    }
}

// ---------------------------------------------------------------------------
void app_main(void)
{
    esp_err_t err = nvs_flash_init();   // o Wi-Fi guarda calibração na NVS
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);
    settings_load();

    ESP_ERROR_CHECK(uart_driver_install(UART_NUM_0, 256, 0, 0, NULL, 0));

    ESP_LOGI(TAG, "=== Smart Parking - entrada (%s) ===", CONFIG_GATE_DEVICE_ID);
    leds_init();
    ultrasonic_init();
    s_camera_ok = camera_ctl_init() == ESP_OK;   // antes do servo: usa LEDC timer 0
    servo_init();
    wifi_start();
    wifi_wait_connected(10000);
    web_start();

#if !CONFIG_GATE_USE_ULTRASONIC
    ESP_LOGW(TAG, "sensor desligado: presença simulada com 'p' / 'x'");
#endif
    print_help();

    s_state_since = now_ms();
    while (true) {
        handle_console();
        update_presence();
        run_state_machine();
        update_status_led();
        vTaskDelay(pdMS_TO_TICKS(5));
    }
}
