#pragma once

#include "esp_camera.h"
#include "esp_err.h"

esp_err_t camera_ctl_init(void);
// Liga o flash, descarta frames antigos e captura. A câmera fica reservada
// (main e página web não capturam ao mesmo tempo) até camera_ctl_release().
camera_fb_t *camera_ctl_capture(void);
void camera_ctl_release(camera_fb_t *fb);
