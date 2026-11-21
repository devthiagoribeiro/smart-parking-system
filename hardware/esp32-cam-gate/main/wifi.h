#pragma once

#include <stdbool.h>
#include <stdint.h>

void wifi_start(void);   // inicia STA e reconecta sozinho quando cair
bool wifi_is_connected(void);
bool wifi_wait_connected(uint32_t timeout_ms);
