#pragma once

void ultrasonic_init(void);
float ultrasonic_read_cm(void);   // uma medição; -1 se não houve eco
