// Ajustes do nó de entrada. Wi-Fi, URL e uso do sensor ficam no menuconfig
// ("Smart Parking - Entrada"), porque o sdkconfig não vai para o Git.
#pragma once

#include "esp_camera.h"

// --- Pinos livres na ESP32-CAM (cartão SD não é usado) ---------------------
#define PIN_SERVO           14
#define PIN_US_TRIG         15
#define PIN_US_ECHO         13   // ECHO do HC-SR04 é 5 V -> divisor de tensão!
#define PIN_FLASH_LED        4   // LED branco onboard
#define PIN_LED_GREEN        2   // LED verde + 220 ohm -> GND
#define PIN_LED_RED         12   // LED vermelho + 220 ohm -> GND (GPIO12 é strapping: sem pull-up)

// --- Ultrassônico -----------------------------------------------------------
#define PRESENCE_CM          60   // abaixo disso = carro na frente da cancela
#define US_SAMPLE_MS         60   // HC-SR04 precisa de >= 60 ms entre medições
#define US_WINDOW             5   // janela da mediana
#define PRESENCE_CONFIRM_MS 800   // tempo contínuo "presente" para disparar
#define CLEAR_CONFIRM_MS   1500   // tempo contínuo "livre" para considerar que saiu

// --- Cancela (servo) --------------------------------------------------------
// 1 = servo de rotação contínua (360°): gira por um tempo e corta o sinal.
// 0 = servo comum de 180°: vai até o ângulo e segura.
#define SERVO_CONTINUOUS      1

// Servo 360°: pulso de 1500 us = parado; afastar do centro = mais rápido.
#define SERVO_STOP_US      1500
#define SERVO_SPEED_US      200   // menor = mais devagar (e mais repetível)
#define SERVO_MOVE_MS       400   // tempo girando p/ abrir ~90° (calibre com + / -)
#define SERVO_OPEN_DIR        1   // troque para -1 se abrir para o lado errado

// Servo 180°:
#define SERVO_CLOSED_DEG      0
#define SERVO_OPEN_DEG       90
#define SERVO_MIN_US        500   // pulso p/ 0°   (SG90: 500..2400)
#define SERVO_MAX_US       2400   // pulso p/ 180°
#define SERVO_STEP_MS         8   // ms por grau (velocidade)
#define CLOSE_DELAY_MS     2000   // carro saiu do sensor -> espera e fecha
#define GATE_MAX_OPEN_MS  60000   // segurança: fecha mesmo assim

// --- Fluxo ------------------------------------------------------------------
#define MAX_ATTEMPTS          3   // fotos por carro antes de desistir
#define RETRY_DELAY_MS     3000   // espera entre fotos quando negado/falha

// --- Rede -------------------------------------------------------------------
#define HTTP_TIMEOUT_MS   30000   // 1º reconhecimento da API carrega o OCR (lento)
#define UPLOAD_RETRIES        3   // só quando a conexão falha antes de enviar a foto
#define UPLOAD_BACKOFF_MS   700   // multiplicado pelo número da tentativa
#define WIFI_RETRY_MS      5000

// --- Câmera (OV2640) --------------------------------------------------------
// SVGA (800x600) equilibra tamanho e leitura. Placa pequena na imagem?
// Teste FRAMESIZE_XGA (1024x768) ou FRAMESIZE_UXGA (1600x1200).
#define CAM_FRAMESIZE      FRAMESIZE_SVGA
#define CAM_JPEG_QUALITY     10   // 0..63, menor = melhor
#define CAM_VFLIP             0
#define CAM_HMIRROR           0
#define USE_FLASH             1
#define FLASH_WARMUP_MS     150   // auto-exposição se ajustar ao flash
#define DISCARD_FRAMES        2   // descarta frames antigos do buffer
