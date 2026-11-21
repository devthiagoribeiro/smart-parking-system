#include "ultrasonic.h"
#include "app_config.h"
#include "driver/gpio.h"
#include "esp_rom_sys.h"
#include "esp_timer.h"

#define ECHO_TIMEOUT_US 30000   // ~5 m

void ultrasonic_init(void)
{
    gpio_reset_pin(PIN_US_TRIG);
    gpio_set_direction(PIN_US_TRIG, GPIO_MODE_OUTPUT);
    gpio_set_level(PIN_US_TRIG, 0);

    gpio_reset_pin(PIN_US_ECHO);
    gpio_set_direction(PIN_US_ECHO, GPIO_MODE_INPUT);
    gpio_set_pull_mode(PIN_US_ECHO, GPIO_FLOATING);   // o divisor já define o nível
}

float ultrasonic_read_cm(void)
{
    gpio_set_level(PIN_US_TRIG, 0);
    esp_rom_delay_us(3);
    gpio_set_level(PIN_US_TRIG, 1);
    esp_rom_delay_us(10);
    gpio_set_level(PIN_US_TRIG, 0);

    int64_t t0 = esp_timer_get_time();
    while (!gpio_get_level(PIN_US_ECHO)) {
        if (esp_timer_get_time() - t0 > ECHO_TIMEOUT_US) return -1;
    }
    int64_t start = esp_timer_get_time();
    while (gpio_get_level(PIN_US_ECHO)) {
        if (esp_timer_get_time() - start > ECHO_TIMEOUT_US) return -1;
    }
    return (float)(esp_timer_get_time() - start) / 58.0f;
}
