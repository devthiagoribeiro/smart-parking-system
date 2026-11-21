# CMakeLists.txt da raiz do projeto ESP-IDF.
# Requer o ESP-IDF instalado e a variável de ambiente IDF_PATH configurada
# (o script export.sh / export.ps1 do ESP-IDF faz isso).
cmake_minimum_required(VERSION 3.16)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(estacionamentoInteligente)
