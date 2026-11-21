set(reqs esp_wifi esp_netif esp_event esp_http_client esp_http_server esp_timer nvs_flash)

# A partir do IDF 5.3 os drivers foram separados em componentes próprios.
if(IDF_VERSION_MAJOR GREATER 5 OR (IDF_VERSION_MAJOR EQUAL 5 AND IDF_VERSION_MINOR GREATER_EQUAL 3))
    list(APPEND reqs esp_driver_ledc esp_driver_gpio esp_driver_uart)
else()
    list(APPEND reqs driver)
endif()

idf_component_register(
    SRCS "settings.c" "web.c" "main.c" "camera_ctl.c" "servo.c" "ultrasonic.c" "wifi.c" "gate_api.c"
    INCLUDE_DIRS "."
    PRIV_REQUIRES ${reqs}
)
