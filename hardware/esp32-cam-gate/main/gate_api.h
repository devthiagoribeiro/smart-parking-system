#pragma once

#include <stddef.h>
#include <stdint.h>

typedef enum { AUTH_OK, AUTH_DENIED, AUTH_ERROR } auth_result_t;

typedef struct {
    char plate[16];
    char reason[64];
    char tipo[12];    // "entrada" / "saida" (API do time)
    char saldo[16];
} auth_info_t;

// Envia o JPEG para a URL configurada (multipart, campo "image", igual à
// API backend/api: POST /plates/recognize) e interpreta a resposta.
//
// Só repete o envio se a conexão falhar ANTES de a foto ir inteira: a API
// registra um evento (entrada/saída) a cada reconhecimento, então repetir
// depois de um timeout poderia registrar o carro duas vezes.
auth_result_t gate_api_authorize(const uint8_t *jpg, size_t len, auth_info_t *info);
