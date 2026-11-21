#pragma once

#include "esp_err.h"

// Ajustes que mudam sem regravar o firmware: editados em http://<ip>/config
// e guardados na NVS (sobrevivem a reinícios). Os valores iniciais vêm do
// menuconfig / app_config.h.
typedef struct {
    char server_url[128];
    int move_ms;     // servo 360°: tempo de giro para abrir/fechar
    int open_dir;    // servo 360°: +1 ou -1
} settings_t;

void settings_load(void);                  // chamar depois de nvs_flash_init()
const settings_t *settings_get(void);
esp_err_t settings_save(const settings_t *s);
