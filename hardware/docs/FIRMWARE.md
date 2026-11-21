# Firmware do Estacionamento Inteligente (protótipo)

Documentação do firmware em [`main/main.c`](../main/main.c), escrito com a API do ESP-IDF (v6.1, alvo ESP32).

## 1. O que o firmware faz

Monitora **2 vagas** de estacionamento, cada uma com o **seu próprio sensor magnético**, e indica o estado de cada vaga com LEDs:

| Estado da vaga | LED verde | LED vermelho |
|----------------|-----------|--------------|
| Livre          | aceso     | apagado      |
| Ocupada        | apagado   | aceso        |

O estado também é impresso no monitor serial a cada 500 ms.

## 2. Hardware

Esquemático: [`assets/esquematico_esp32_gy82_vagas.svg`](../assets/esquematico_esp32_gy82_vagas.svg)

| Função                   | Pino ESP32 | Observação                          |
|--------------------------|------------|-------------------------------------|
| Sensor 1 (vaga 1) – SDA  | GPIO21     | I2C0. Pull-up interno habilitado    |
| Sensor 1 (vaga 1) – SCL  | GPIO22     | I2C0. Pull-up interno habilitado    |
| Sensor 2 (vaga 2) – SDA  | GPIO16     | I2C1. Pull-up interno habilitado    |
| Sensor 2 (vaga 2) – SCL  | GPIO17     | I2C1. Pull-up interno habilitado    |
| Vaga 1 – verde           | GPIO13     | Resistor de 220 Ω em série          |
| Vaga 1 – vermelho        | GPIO14     | Resistor de 220 Ω em série          |
| Vaga 2 – verde           | GPIO25     | Resistor de 220 Ω em série          |
| Vaga 2 – vermelho        | GPIO26     | Resistor de 220 Ω em série          |

Os dois GY-82 usam o chip **HMC5883L** (magnetômetro de 3 eixos), alimentados em 3V3 e com GND comum.

### Por que dois barramentos I2C

O HMC5883L tem endereço I2C **fixo em `0x1E`**, que não pode ser alterado. Dois sensores no mesmo barramento colidiriam. Por isso cada sensor fica em um barramento independente (o ESP32 tem dois controladores I2C: `I2C_NUM_0` e `I2C_NUM_1`).

## 3. Como a detecção funciona

Um carro é uma grande massa de metal e **distorce o campo magnético** ao redor dele. Cada sensor mede o campo da sua vaga; se ele mudar o suficiente em relação ao normal, consideramos que há um carro.

1. **Referência:** logo após ligar, o firmware lê cada sensor uma vez e guarda os valores (X, Y, Z) como "vaga livre". Cada sensor tem a sua própria referência, porque o valor base varia de chip para chip.
2. **Comparação:** a cada 500 ms lê de novo e calcula a diferença para a referência do mesmo sensor.
3. **Decisão:** se a diferença em **X ou em Y** passar de `LIMITE` (0,08 Gauss), a vaga é considerada ocupada.

> O eixo Z é lido, mas ainda **não participa da decisão**.

## 4. Estrutura do código

`main.c` tem 3 funções auxiliares e o `app_main`:

| Função | O que faz |
|--------|-----------|
| `sensor_escreve(reg, valor, sensor)` | Escreve um byte em um registrador do HMC5883L indicado por `sensor`. |
| `sensor_le(&x, &y, &z, sensor)` | Lê 6 bytes a partir do registrador `0x03` do sensor indicado e converte para Gauss (divide por 1090, o ganho configurado). |
| `mostra_vaga(verde, vermelho, ocupada)` | Acende o LED certo conforme o estado da vaga. |
| `app_main()` | Configura GPIOs, os dois barramentos I2C e os dois sensores; tira as referências; entra no laço principal. |

### Objetos do I2C

| Objeto | Função | Quantidade |
|--------|--------|------------|
| `bus_cfg1`, `bus_cfg2` (`i2c_master_bus_config_t`) | Descrevem um barramento: porta, pinos SDA/SCL, pull-up. | 1 por barramento |
| `bus1`, `bus2` (`i2c_master_bus_handle_t`) | O barramento já criado por `i2c_new_master_bus`. | 1 por barramento |
| `dev_cfg` (`i2c_device_config_t`) | Endereço (`0x1E`) e velocidade (100 kHz). Reaproveitado pelos dois sensores. | 1 |
| `sensor1`, `sensor2` (`i2c_master_dev_handle_t`) | Handle de cada sensor, criado por `i2c_master_bus_add_device`. É ele que identifica "qual sensor" nas funções de leitura/escrita. | 1 por sensor |

Fluxo do `app_main`:

```
configura LEDs (saída)
cria barramento I2C0 (GPIO21/22)  ->  bus1
cria barramento I2C1 (GPIO16/17)  ->  bus2
adiciona sensor1 em bus1, sensor2 em bus2
configura os dois sensores
lê referência de cada sensor (vagas livres)
loop a cada 500 ms:
    lê sensor1  ->  ocupada1 = |X - refX1| > LIMITE  ou  |Y - refY1| > LIMITE
    lê sensor2  ->  ocupada2 = |X - refX2| > LIMITE  ou  |Y - refY2| > LIMITE
    atualiza LEDs e imprime no log
```

### Funções do ESP-IDF utilizadas

| API | Uso |
|-----|-----|
| `gpio_reset_pin`, `gpio_set_direction`, `gpio_set_level` | Controle dos LEDs |
| `i2c_new_master_bus` | Cria um barramento I2C (chamada duas vezes) |
| `i2c_master_bus_add_device` | Registra um sensor em um barramento (chamada duas vezes) |
| `i2c_master_transmit` | Escreve nos registradores |
| `i2c_master_transmit_receive` | Lê os dados (envia o endereço do registrador e recebe 6 bytes) |
| `ESP_ERROR_CHECK` | Aborta com mensagem se alguma chamada falhar |
| `ESP_LOGI` | Log no monitor serial |
| `vTaskDelay` | Espera entre leituras |

### Registradores do HMC5883L usados

Escritos em **cada** sensor:

| Registrador | Valor | Significado |
|-------------|-------|-------------|
| `0x00` (Config A) | `0x70` | Média de 8 amostras, 15 Hz |
| `0x01` (Config B) | `0x20` | Ganho ±1,3 Ga (1090 LSB/Ga) |
| `0x02` (Modo)     | `0x00` | Medição contínua |
| `0x03`–`0x08`     | —      | Dados: X(H,L), Z(H,L), Y(H,L) |

Atenção: a ordem dos dados no sensor é **X, Z, Y** (não X, Y, Z).

## 5. Como compilar e gravar

No terminal do ESP-IDF, na raiz do projeto:

```bash
idf.py build
idf.py -p COMx flash monitor
```

(troque `COMx` pela porta serial da placa). Para sair do monitor: `Ctrl+]`.

## 6. Ajustes e testes

- **Ligue com as duas vagas livres.** As referências são tiradas no boot; se houver carro em alguma vaga nesse momento, o resultado dela fica invertido.
- **`LIMITE`** (`main.c`): se uma vaga acende vermelho sem carro, aumente; se não detecta o carro, diminua. Use os valores do log como guia.
- Cada vaga pode precisar de um limite diferente, dependendo de como o sensor foi posicionado.

## 7. Limitações conhecidas (propositais, por ser protótipo)

- Sem filtro/debounce: leituras ruidosas podem fazer o LED piscar.
- Sem histerese: perto do limite, o estado pode oscilar.
- Sem tratamento de erro além de abortar (`ESP_ERROR_CHECK`): se um sensor não responder, o ESP32 reinicia.
- A referência não é salva; é recalculada a cada boot.
- O eixo Z não é usado na decisão.
- Sem comunicação (Wi-Fi/MQTT): o estado só aparece nos LEDs e no log.

## 8. Próximos passos sugeridos

1. Média de várias leituras / debounce para estabilizar a detecção.
2. Histerese (limites diferentes para ocupar e liberar).
3. Calibração salva na NVS.
4. Usar o eixo Z (ou o módulo do vetor) na decisão.
5. Publicar o estado das vagas via MQTT.
