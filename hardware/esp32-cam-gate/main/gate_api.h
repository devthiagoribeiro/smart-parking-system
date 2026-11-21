#pragma once

#include <stddef.h>
#include <stdint.h>

typedef enum { AUTH_OK, AUTH_DENIED, AUTH_ERROR } auth_result_t;

typedef struct {
    char plate[16];
    char reason[48];
} auth_info_t;

// POST do JPEG em CONFIG_GATE_SERVER_URL. Repete em erro de rede/5xx.
auth_result_t gate_api_authorize(const uint8_t *jpg, size_t len, auth_info_t *info);
