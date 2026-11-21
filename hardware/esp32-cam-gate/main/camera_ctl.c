#include "camera_ctl.h"
#include "app_config.h"
#include "driver/gpio.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"

static const char *TAG = "cam";
static SemaphoreHandle_t s_lock;

// Pinagem AI-Thinker
#define PWDN_GPIO_NUM   32
#define RESET_GPIO_NUM  -1
#define XCLK_GPIO_NUM    0
#define SIOD_GPIO_NUM   26
#define SIOC_GPIO_NUM   27
#define Y9_GPIO_NUM     35
#define Y8_GPIO_NUM     34
#define Y7_GPIO_NUM     39
#define Y6_GPIO_NUM     36
#define Y5_GPIO_NUM     21
#define Y4_GPIO_NUM     19
#define Y3_GPIO_NUM     18
#define Y2_GPIO_NUM      5
#define VSYNC_GPIO_NUM  25
#define HREF_GPIO_NUM   23
#define PCLK_GPIO_NUM   22

esp_err_t camera_ctl_init(void)
{
    gpio_reset_pin(PIN_FLASH_LED);
    gpio_set_direction(PIN_FLASH_LED, GPIO_MODE_OUTPUT);
    gpio_set_level(PIN_FLASH_LED, 0);

    bool psram = heap_caps_get_total_size(MALLOC_CAP_SPIRAM) > 0;

    camera_config_t config = {
        .pin_pwdn = PWDN_GPIO_NUM,
        .pin_reset = RESET_GPIO_NUM,
        .pin_xclk = XCLK_GPIO_NUM,
        .pin_sccb_sda = SIOD_GPIO_NUM,
        .pin_sccb_scl = SIOC_GPIO_NUM,
        .pin_d7 = Y9_GPIO_NUM,
        .pin_d6 = Y8_GPIO_NUM,
        .pin_d5 = Y7_GPIO_NUM,
        .pin_d4 = Y6_GPIO_NUM,
        .pin_d3 = Y5_GPIO_NUM,
        .pin_d2 = Y4_GPIO_NUM,
        .pin_d1 = Y3_GPIO_NUM,
        .pin_d0 = Y2_GPIO_NUM,
        .pin_vsync = VSYNC_GPIO_NUM,
        .pin_href = HREF_GPIO_NUM,
        .pin_pclk = PCLK_GPIO_NUM,
        .xclk_freq_hz = 20000000,
        .ledc_timer = LEDC_TIMER_0,
        .ledc_channel = LEDC_CHANNEL_0,
        .pixel_format = PIXFORMAT_JPEG,
        .frame_size = psram ? CAM_FRAMESIZE : FRAMESIZE_VGA,
        .jpeg_quality = CAM_JPEG_QUALITY,
        .fb_count = psram ? 2 : 1,
        .fb_location = psram ? CAMERA_FB_IN_PSRAM : CAMERA_FB_IN_DRAM,
        .grab_mode = psram ? CAMERA_GRAB_LATEST : CAMERA_GRAB_WHEN_EMPTY,
    };
    if (!psram) ESP_LOGW(TAG, "sem PSRAM: limitando a VGA");

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "falha no init: %s", esp_err_to_name(err));
        return err;
    }

    sensor_t *s = esp_camera_sensor_get();
    s->set_vflip(s, CAM_VFLIP);
    s->set_hmirror(s, CAM_HMIRROR);
    s->set_whitebal(s, 1);
    s->set_awb_gain(s, 1);
    s->set_exposure_ctrl(s, 1);
    s->set_aec2(s, 1);                       // AEC por DSP: lida melhor com luz variando
    s->set_gain_ctrl(s, 1);
    s->set_gainceiling(s, GAINCEILING_4X);   // menos ruído nos caracteres
    s->set_lenc(s, 1);
    s->set_dcw(s, 1);
    s_lock = xSemaphoreCreateMutex();
    ESP_LOGI(TAG, "ok (PID 0x%02x)", s->id.PID);
    return ESP_OK;
}

camera_fb_t *camera_ctl_capture(void)
{
    if (!s_lock || xSemaphoreTake(s_lock, pdMS_TO_TICKS(20000)) != pdTRUE) {
        ESP_LOGE(TAG, "câmera ocupada");
        return NULL;
    }
#if USE_FLASH
    gpio_set_level(PIN_FLASH_LED, 1);
    vTaskDelay(pdMS_TO_TICKS(FLASH_WARMUP_MS));
#endif
    for (int i = 0; i < DISCARD_FRAMES; i++) {
        camera_fb_t *old = esp_camera_fb_get();
        if (old) esp_camera_fb_return(old);
    }
    camera_fb_t *fb = esp_camera_fb_get();
#if USE_FLASH
    gpio_set_level(PIN_FLASH_LED, 0);
#endif
    if (fb) {
        ESP_LOGI(TAG, "foto %ux%u, %u bytes", fb->width, fb->height, (unsigned)fb->len);
    } else {
        ESP_LOGE(TAG, "falha ao capturar");
        xSemaphoreGive(s_lock);
    }
    return fb;
}

void camera_ctl_release(camera_fb_t *fb)
{
    if (!fb) return;
    esp_camera_fb_return(fb);
    xSemaphoreGive(s_lock);
}
