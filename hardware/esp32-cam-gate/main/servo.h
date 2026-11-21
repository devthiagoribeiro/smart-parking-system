#pragma once

#include <stdbool.h>

void servo_init(void);
void servo_open(void);    // bloqueia até terminar o movimento
void servo_close(void);
bool servo_is_open(void);

// Servo 360°: ajusta o tempo de giro em tempo de execução (calibração).
void servo_adjust_move_ms(int delta_ms);
int servo_move_ms(void);
