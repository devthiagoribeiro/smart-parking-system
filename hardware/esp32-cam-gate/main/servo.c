// Servo da cancela via LEDC a 50 Hz.
// A câmera usa LEDC timer 0 / canal 0 para o XCLK; o servo fica no
// timer 2 / canal 4 para não conflitar.
//
// SERVO_CONTINUOUS = 1 (servo 360°): o pulso controla a VELOCIDADE, não o
// ângulo. Abrir = girar num sentido por SERVO_MOVE_MS e cortar o sinal
// (sem pulso o servo para de vez). Fechar = mesmo tempo no sentido contrário.
#include "servo.h"
#include "app_config.h"
#include "driver/ledc.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "settings.h"

#define SERVO_MODE      LEDC_LOW_SPEED_MODE
#define SERVO_TIMER     LEDC_TIMER_2
#define SERVO_CHANNEL   LEDC_CHANNEL_4
#define SERVO_RES_BITS  14
#define SERVO_PERIOD_US 20000

static const char *TAG = "servo";
static bool s_open;
#if !SERVO_CONTINUOUS
static int s_angle = SERVO_CLOSED_DEG;
#endif

// us = 0 desliga o sinal (sem pulsos).
static void write_us(uint32_t us)
{
    uint32_t duty = us * ((1u << SERVO_RES_BITS) - 1) / SERVO_PERIOD_US;
    ledc_set_duty(SERVO_MODE, SERVO_CHANNEL, duty);
    ledc_update_duty(SERVO_MODE, SERVO_CHANNEL);
}

#if !SERVO_CONTINUOUS
static void write_deg(int deg)
{
    if (deg < 0) deg = 0;
    if (deg > 180) deg = 180;
    write_us(SERVO_MIN_US + (uint32_t)deg * (SERVO_MAX_US - SERVO_MIN_US) / 180);
}

static void move_to(int target)
{
    int step = target > s_angle ? 1 : -1;
    while (s_angle != target) {
        s_angle += step;
        write_deg(s_angle);
        vTaskDelay(pdMS_TO_TICKS(SERVO_STEP_MS));
    }
}
#else
static void spin(int dir)
{
    const settings_t *s = settings_get();
    write_us(SERVO_STOP_US + dir * s->open_dir * SERVO_SPEED_US);
    vTaskDelay(pdMS_TO_TICKS(s->move_ms));
    write_us(0);
}
#endif

void servo_init(void)
{
    ledc_timer_config_t t = {
        .speed_mode = SERVO_MODE,
        .duty_resolution = SERVO_RES_BITS,
        .timer_num = SERVO_TIMER,
        .freq_hz = 50,
        .clk_cfg = LEDC_AUTO_CLK,
    };
    ESP_ERROR_CHECK(ledc_timer_config(&t));

    ledc_channel_config_t c = {
        .gpio_num = PIN_SERVO,
        .speed_mode = SERVO_MODE,
        .channel = SERVO_CHANNEL,
        .intr_type = LEDC_INTR_DISABLE,
        .timer_sel = SERVO_TIMER,
        .duty = 0,
        .hpoint = 0,
    };
    ESP_ERROR_CHECK(ledc_channel_config(&c));

    s_open = false;
#if SERVO_CONTINUOUS
    write_us(0);   // parado até receber um comando
    ESP_LOGI(TAG, "modo 360°: giro de %d ms a %d us do centro", settings_get()->move_ms,
             SERVO_SPEED_US);
#else
    write_deg(s_angle);
#endif
}

void servo_open(void)
{
#if SERVO_CONTINUOUS
    spin(+1);
#else
    move_to(SERVO_OPEN_DEG);
#endif
    s_open = true;
}

void servo_close(void)
{
#if SERVO_CONTINUOUS
    spin(-1);
#else
    move_to(SERVO_CLOSED_DEG);
#endif
    s_open = false;
}

bool servo_is_open(void)
{
    return s_open;
}

void servo_adjust_move_ms(int delta_ms)
{
    settings_t s = *settings_get();
    s.move_ms += delta_ms;
    if (s.move_ms < 50) s.move_ms = 50;
    if (s.move_ms > 5000) s.move_ms = 5000;
    settings_save(&s);
    ESP_LOGI(TAG, "tempo de giro = %d ms (salvo na placa)", s.move_ms);
}

int servo_move_ms(void)
{
    return settings_get()->move_ms;
}
