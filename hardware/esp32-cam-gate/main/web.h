#pragma once

// Servidor HTTP na porta 80:
//   GET /         página com a foto e botão "Nova foto"
//   GET /capture  tira uma foto e devolve o JPEG
void web_start(void);
