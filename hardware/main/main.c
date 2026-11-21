/*
 * Estacionamento inteligente (prototipo)
 * ESP32 + sensor GY-82 (HMC5883L) + 2 vagas com LED verde/vermelho.
 * Pinagem: assets/esquematico_esp32_gy82_vagas.svg
 * Explicacao completa: docs/FIRMWARE.md
 */

#include <math.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "driver/i2c_master.h"
#include "esp_log.h"

static const char *TAG = "estacionamento";

/* LEDs */
#define VERDE1      GPIO_NUM_13
#define VERMELHO1   GPIO_NUM_14
#define VERDE2      GPIO_NUM_25
#define VERMELHO2   GPIO_NUM_26

/* I2C */
#define PIN_SDA1     GPIO_NUM_21
#define PIN_SCL1     GPIO_NUM_22
#define PIN_SDA2     GPIO_NUM_16
#define PIN_SCL2     GPIO_NUM_17

/* Sensor HMC5883L */
#define HMC_ADDR    0x1E
#define LIMITE      0.08f   /* variacao do campo (Gauss) que indica carro */

#define BUS_TOTAL 2

static i2c_master_dev_handle_t sensor1;
static i2c_master_dev_handle_t sensor2;

static char busCounter = 0;

/* Escreve um valor em um registrador do sensor */
static void sensor_escreve(uint8_t reg, uint8_t valor, i2c_master_dev_handle_t sensor)
{
    uint8_t dados[2] = { reg, valor };
    ESP_ERROR_CHECK(i2c_master_transmit(sensor, dados, 2, 100));
}

/* Le o campo magnetico nos eixos X, Y e Z (em Gauss) */
static void sensor_le(float *x, float *y, float *z, i2c_master_dev_handle_t sensor)
{
    uint8_t reg = 0x03;   /* primeiro registrador de dados */
    uint8_t d[6];         /* X(2 bytes) Z(2 bytes) Y(2 bytes) */
    ESP_ERROR_CHECK(i2c_master_transmit_receive(sensor, &reg, 1, d, 6, 100));

    *x = (int16_t)((d[0] << 8) | d[1]) / 1090.0f;
    *z = (int16_t)((d[2] << 8) | d[3]) / 1090.0f;
    *y = (int16_t)((d[4] << 8) | d[5]) / 1090.0f;
}

/* Acende verde (livre) ou vermelho (ocupada) */
static void mostra_vaga(gpio_num_t verde, gpio_num_t vermelho, bool ocupada)
{
    gpio_set_level(verde, !ocupada);
    gpio_set_level(vermelho, ocupada);
}

void setupI2C(int SDA, int SCL, i2c_master_dev_handle_t sensor) {
    i2c_port_num_t port;

    if(!busCounter) {
        port = I2C_NUM_0;
        busCounter++;
    } else {
        port = I2C_NUM_1;
    }

    i2c_master_bus_config_t bus_config = {
        .i2c_port = port,
        .sda_io_num = SDA,
        .scl_io_num = SCL,
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .flags.enable_internal_pullup = true,
    };

    i2c_master_bus_handle_t bus;
    ESP_ERROR_CHECK(i2c_new_master_bus(&bus_config, &bus));

    i2c_device_config_t dev_cfg = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = HMC_ADDR,
        .scl_speed_hz = 100000,
    };

    ESP_ERROR_CHECK(i2c_master_bus_add_device(bus, &dev_cfg, &sensor));

    sensor_escreve(0x00, 0x10, sensor); // 15Hz amostragem
    sensor_escreve(0x01, 0xE0, sensor); // 8,1 Gauss
    sensor_escreve(0x02, 0x00, sensor); // Continua
}

void leituraReferencia(float *x1, float *y1, float *z1){
    sensor_le(&(*x1), &(*y1), &(*z1), sensor1);
    ESP_LOGI(TAG, "Referencia: X=%.3f Y=%.3f Z=%.3f", *x1, *y1, *z1);
}

void app_main(void)
{
    /* LEDs como saida */
    gpio_num_t leds[] = { VERDE1, VERMELHO1, VERDE2, VERMELHO2 };
    for (int i = 0; i < 4; i++) {
        gpio_reset_pin(leds[i]);
        gpio_set_direction(leds[i], GPIO_MODE_OUTPUT);
    }

    // sensores
    setupI2C(PIN_SDA1, PIN_SCL1, sensor1);

    vTaskDelay(pdMS_TO_TICKS(100));

    /* Leitura de referencia: assume as duas vagas livres no inicio */
    float ref_x1, ref_y1, ref_z1, ref_x2, ref_y2, ref_z2;
    leituraReferencia(&ref_x1, &ref_y1, &ref_z1);
    leituraReferencia(&ref_x2, &ref_y2, &ref_z2);

    while (1) {
        float x, y, z;
        sensor_le(&x, &y, &z, sensor1);
        bool ocupada1 = (fabsf(x - ref_x1) > LIMITE) || (fabsf(y - ref_y1) > LIMITE);
        sensor_le(&x, &y, &z, sensor2);
        bool ocupada2 = (fabsf(x - ref_x2) > LIMITE) || (fabsf(y - ref_y2) > LIMITE);

        mostra_vaga(VERDE1, VERMELHO1, ocupada1);
        mostra_vaga(VERDE2, VERMELHO2, ocupada2);

        ESP_LOGI(TAG, "Vaga 1: %s | Vaga 2: %s",
                 ocupada1 ? "ocupada" : "livre",
                 ocupada2 ? "ocupada" : "livre");

        vTaskDelay(pdMS_TO_TICKS(500));
    }
}
