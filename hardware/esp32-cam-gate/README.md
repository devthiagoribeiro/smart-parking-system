# ESP32-CAM — Entrada (sensor + câmera + cancela) · ESP-IDF

Nó da entrada do estacionamento: detecta o carro com o HC-SR04, fotografa a placa,
envia o JPEG ao servidor e abre a cancela (servo) só quando o servidor libera.

```
carro chega ──► HC-SR04 confirma presença (mediana + 800 ms)
            ──► flash + foto (SVGA, JPEG q=10)
            ──► POST /api/gate/entry  (até 3 tentativas)
            ──► authorized=true  → LED verde, abre cancela
                                   carro sai do sensor + 2 s → fecha
            ──► authorized=false → LED vermelho, nova foto em 3 s (máx. 3)
                                   só rearma depois que o carro sair
```

## Estrutura

| Arquivo | O quê |
|---|---|
| `main/main.c` | máquina de estados, presença, LEDs, console serial |
| `main/camera_ctl.c` | init da OV2640 + captura com flash |
| `main/servo.c` | servo via LEDC (timer 2, para não brigar com a câmera) |
| `main/ultrasonic.c` | leitura do HC-SR04 |
| `main/wifi.c` | Wi-Fi STA com reconexão automática |
| `main/gate_api.c` | upload HTTP + retry + leitura da resposta |
| `main/app_config.h` | pinos, limiares, ângulos, câmera |
| `main/Kconfig.projbuild` | Wi-Fi, URL, ID e liga/desliga sensor (via menuconfig) |
| `main/idf_component.yml` | dependência `espressif/esp32-camera` (baixada no 1º build) |
| `sdkconfig.defaults` | PSRAM, 4 MB flash, partição grande, tick 1 ms |
| `tools/mock_server.py` | servidor de teste com o mesmo contrato da API |

O `sdkconfig` gerado guarda a senha do Wi-Fi, por isso **não vai para o Git**.

## 1. Terminar a instalação do ESP-IDF no VS Code

1. `Ctrl+Shift+P` → **ESP-IDF: Configure ESP-IDF Extension** (ou *Open ESP-IDF Installation Manager*).
2. Escolha **Express**, a versão estável mais recente (v5.x) e deixe instalar
   (baixa ~1–2 GB para `C:\Espressif`).
3. Feche e reabra o VS Code.

## 2. Abrir e configurar o projeto

1. **File → Open Folder** → abra **esta pasta** (`hardware/esp32-cam-gate`), não a raiz do repositório.
2. Barra azul de baixo (ou `Ctrl+Shift+P`):
   - **Set Espressif Device Target** → `esp32` (se pedir o tipo de conexão, escolha a opção via USB/UART).
   - **Select Port to Use** → a COM do Arduino Uno.
   - **Select Flash Method** → `UART`.
3. **SDK Configuration Editor** (ícone de engrenagem) → seção **Smart Parking - Entrada**:
   - Wi-Fi SSID / senha
   - URL do servidor (IP do seu PC, ex.: `http://192.168.0.10:8000/api/gate/entry`)
   - *Usar sensor HC-SR04*: deixe desmarcado até o sensor chegar.
   - Clique em **Save**.
4. Velocidade de gravação via Uno: `Ctrl+Shift+P` → *Preferences: Open Settings (UI)* →
   pesquise `idf.flashBaudRate` → **115200** (o padrão 460800 costuma falhar pelo Uno).

## 3. Ligações para gravar com o Arduino Uno

| Arduino Uno | ESP32-CAM |
|---|---|
| 5V | 5V (esquerdo, 1º pino) |
| GND | GND (esquerdo, 2º pino) |
| D0 (RX) | U0R (direito, 6º pino) |
| D1 (TX) | U0T (direito, 7º pino) |
| RESET → GND do Uno | — |
| — | **IO0 → GND** (direito, 3º e 4º pinos) |

TX com TX e RX com RX (o Uno vira só um conversor USB-serial). **Não ligue nada no VCC** da ESP32-CAM.

## 4. Compilar, gravar e monitorar

1. **Build** (ícone de chave inglesa). O 1º build demora: baixa o componente da câmera.
2. Com o IO0 no GND, aperte o **RST** da ESP32-CAM e clique em **Flash** (raio).
   Se ficar em `Connecting....___`, aperte RST de novo.
3. Tire o **IO0 do GND**, aperte **RST** e clique em **Monitor** (ícone de tela).
   Para sair do monitor: `Ctrl+]`.

Pelo terminal ESP-IDF é o mesmo:

```bash
idf.py set-target esp32
```

```bash
idf.py menuconfig
```

```bash
idf.py -p COM5 -b 115200 build flash monitor
```

## Ver a câmera no navegador

Depois de conectar no Wi-Fi o monitor mostra `câmera no navegador: http://<ip>/`.
Abra esse endereço no PC ou celular (mesma rede):

- **Nova foto** / **Baixar**: tira e salva uma foto (`/capture` devolve só o JPEG).
- **Abrir / Fechar cancela**: testa o servo sem o monitor serial.
- **Configurar** (`/config`): URL do servidor, tempo de giro e sentido do servo 360°.
  Fica salvo na placa (NVS) — **não precisa Build/Flash para mudar isso**.
  O valor do menuconfig só vale enquanto nada foi salvo pela página.

## Servo 360° (rotação contínua)

Com `SERVO_CONTINUOUS 1` (padrão) o servo gira por `SERVO_MOVE_MS` e depois o
sinal é cortado (sem pulso ele para). Para calibrar no monitor:

- `o` abre, `c` fecha. Se abrir para o lado errado, troque `SERVO_OPEN_DIR` para `-1`.
- `+` / `-` aumenta / diminui o tempo de giro em 50 ms até a cancela ir de 0° a ~90°.
  O valor já fica salvo na placa (ou ajuste em `http://<ip>/config`).

Com um SG90 comum de 180°, use `SERVO_CONTINUOUS 0` e ajuste os ângulos.

## Roteiro de teste (sem API pronta e sem sensor)

1. **Só a placa:** grave e abra o monitor. Deve aparecer `cam: ok` e `wifi: conectado, IP ...`.
2. **Servo, sem servidor:** digite `o` (abre) e `c` (fecha). Ajuste `SERVO_OPEN_DEG` /
   `SERVO_CLOSED_DEG` em `main/app_config.h` até a cancela ficar certa.
3. **Câmera + rede:** rode o `mock_server.py` (ele faz o papel da API) e digite `f`.
   A foto aparece em `tools/captures/`; confira foco e enquadramento.
4. **Fluxo completo:** com `--mode allow`, digite `p` → foto → cancela abre → `x` → fecha em 2 s.
5. **Negado / lotado:** reinicie o servidor com `--mode deny` ou `--mode full` e repita `p`:
   LED vermelho pisca, 3 tentativas, cancela continua fechada. `x` rearma.
6. **Sem Wi-Fi / servidor fora:** pare o servidor (`Ctrl+C`) e digite `p`: 3 tentativas
   de envio por foto, termina em ERRO e a cancela não abre.

## Testando sem o sensor ultrassônico

Com o sensor desmarcado no menuconfig, digite no monitor:

| Tecla | Efeito |
|---|---|
| `p` | carro chegou → foto + envio |
| `x` | carro saiu → cancela fecha 2 s depois |
| `o` / `c` | abre / fecha a cancela (calibrar ângulos) |
| `f` | foto + envio sem mexer na cancela |
| `d` | mede distância no HC-SR04 |
| `s` | status (estado, Wi-Fi, memória) |

No PC (mesma rede da ESP):

```bash
python hardware/esp32-cam-gate/tools/mock_server.py --mode allow
```

Modos: `allow`, `deny`, `full` (lotado) e `ocr` (YOLO + OCR real; libera as placas de
`--plates ABC1D23,XYZ9876`). As fotos recebidas ficam em `tools/captures/`.
Libere a porta 8000 no Firewall do Windows se a ESP não conseguir conectar.

## Contrato com o servidor (para quem fizer a API)

`POST /api/gate/entry` — headers `Content-Type: image/jpeg`, `X-Device-Id`, `X-Api-Key` (opcional);
corpo = bytes do JPEG (não é multipart). Resposta `200`:

```json
{ "authorized": true,  "plate": "ABC1D23", "reason": "ok" }
{ "authorized": false, "plate": "ABC1D23", "reason": "not_registered" }
{ "authorized": false, "plate": null,      "reason": "plate_not_found" }
{ "authorized": false, "plate": "ABC1D23", "reason": "parking_full" }
```

`4xx` → a ESP não repete. `5xx`/timeout → repete até 3x. Responder em < 15 s.

## Ligações finais (com sensor e servo)

| Componente | Pino ESP32-CAM | Observação |
|---|---|---|
| Servo sinal | GPIO 14 | V+ em **fonte 5 V separada**, GNDs unidos |
| HC-SR04 TRIG | GPIO 15 | |
| HC-SR04 ECHO | GPIO 13 | **divisor**: ECHO─1 kΩ─GPIO13─2 kΩ─GND (ECHO é 5 V) |
| HC-SR04 VCC | 5 V | |
| LED vermelho | GPIO 12 → 220 Ω → perna longa; perna curta → GND | |
| LED verde | GPIO 2 → 220 Ω → perna longa; perna curta → GND | |
| Flash | GPIO 4 | LED branco da própria placa |

![Pinagem](docs/pinagem.svg)

A câmera ocupa quase todos os pinos; os livres (2, 4, 12, 13, 14, 15) são do
cartão SD — por isso o SD não é usado.

LEDs: os dois acesos = processando · verde = liberado · vermelho piscando = negado ·
os dois piscando juntos = sem Wi-Fi.

## Checklist

- [x] Leitura de distância, mediana e limiar com tempo de confirmação
- [x] Sem disparos repetidos: rearma só depois que a área fica livre
- [x] Foto: SVGA, JPEG 10, flash, descarte de frames velhos
- [x] Upload HTTP com retry/backoff; em falha a cancela fica fechada
- [x] Servo abre só com `authorized: true`; fecha após passagem ou 60 s
- [x] Wi-Fi com reconexão automática; os dois LEDs piscam quando offline
- [ ] Primeiro build no ESP-IDF
- [ ] Calibrar ângulos do servo na maquete
- [ ] Ajustar `PRESENCE_CM` e posição/foco da câmera com o sensor real
