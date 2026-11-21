#include "web.h"
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "camera_ctl.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "servo.h"
#include "settings.h"

static const char *TAG = "web";

#define STYLE                                                                              \
    "<meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" \
    "<style>body{font-family:sans-serif;background:#111;color:#eee;margin:0;padding:16px;"   \
    "text-align:center}img{max-width:100%;border:1px solid #444;margin-top:12px;"            \
    "background:#222;min-height:200px}button,a.b{font-size:16px;padding:10px 18px;"          \
    "margin:4px;border-radius:8px;border:0;background:#2e7d32;color:#fff;"                    \
    "text-decoration:none;display:inline-block;cursor:pointer}a.b{background:#1565c0}"       \
    ".g{background:#555!important}#s{color:#aaa;font-size:14px;min-height:20px}"              \
    "form{max-width:480px;margin:auto;text-align:left}label{display:block;margin-top:14px}"  \
    "input,select{width:100%;padding:8px;font-size:15px;box-sizing:border-box}"              \
    "small{color:#999}</style>"

static const char INDEX_HTML[] =
    "<!doctype html><html lang=pt-br><head>" STYLE "<title>ESP32-CAM entrada</title></head><body>"
    "<h2>ESP32-CAM &middot; entrada</h2>"
    "<button onclick=snap()>Nova foto</button><a class=b href=/capture download=placa.jpg>Baixar</a>"
    "<br><button class=g onclick=\"gate('abrir')\">Abrir cancela</button>"
    "<button class=g onclick=\"gate('fechar')\">Fechar cancela</button>"
    "<a class='b g' href=/config>Configurar</a>"
    "<div id=s></div><img id=f alt=foto>"
    "<script>var s=document.getElementById('s'),f=document.getElementById('f');"
    "function snap(){s.textContent='tirando foto...';"
    "f.onload=function(){s.textContent='ok ('+f.naturalWidth+'x'+f.naturalHeight+') '+new Date().toLocaleTimeString()};"
    "f.onerror=function(){s.textContent='falhou, tente de novo'};f.src='/capture?t='+Date.now()}"
    "function gate(a){s.textContent=a+'...';fetch('/gate?acao='+a).then(function(r){return r.text()})"
    ".then(function(t){s.textContent=t})}"
    "snap()</script></body></html>";

static esp_err_t index_handler(httpd_req_t *req)
{
    httpd_resp_set_type(req, "text/html; charset=utf-8");
    return httpd_resp_send(req, INDEX_HTML, HTTPD_RESP_USE_STRLEN);
}

static esp_err_t capture_handler(httpd_req_t *req)
{
    camera_fb_t *fb = camera_ctl_capture();
    if (!fb) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "falha na captura");
        return ESP_FAIL;
    }
    httpd_resp_set_type(req, "image/jpeg");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    httpd_resp_set_hdr(req, "Content-Disposition", "inline; filename=placa.jpg");
    esp_err_t err = httpd_resp_send(req, (const char *)fb->buf, fb->len);
    camera_ctl_release(fb);
    return err;
}

static esp_err_t gate_handler(httpd_req_t *req)
{
    char q[32] = "", acao[16] = "";
    httpd_req_get_url_query_str(req, q, sizeof(q));
    httpd_query_key_value(q, "acao", acao, sizeof(acao));
    httpd_resp_set_type(req, "text/plain; charset=utf-8");
    if (strcmp(acao, "abrir") == 0) {
        ESP_LOGI(TAG, "abrir cancela (pagina)");
        servo_open();
        return httpd_resp_sendstr(req, "cancela aberta");
    }
    if (strcmp(acao, "fechar") == 0) {
        ESP_LOGI(TAG, "fechar cancela (pagina)");
        servo_close();
        return httpd_resp_sendstr(req, "cancela fechada");
    }
    httpd_resp_set_status(req, "400 Bad Request");
    return httpd_resp_sendstr(req, "use ?acao=abrir ou ?acao=fechar");
}

// Escapa aspas/sinais para inserir o valor num atributo HTML.
static void html_attr(char *out, size_t n, const char *in)
{
    size_t o = 0;
    for (; *in && o + 7 < n; in++) {
        const char *rep = NULL;
        if (*in == '"') rep = "&quot;";
        else if (*in == '<') rep = "&lt;";
        else if (*in == '&') rep = "&amp;";
        if (rep) {
            size_t l = strlen(rep);
            memcpy(out + o, rep, l);
            o += l;
        } else {
            out[o++] = *in;
        }
    }
    out[o] = '\0';
}

static esp_err_t config_get_handler(httpd_req_t *req)
{
    const settings_t *s = settings_get();
    char url[200];
    html_attr(url, sizeof(url), s->server_url);
    char *page = malloc(3072);
    if (!page) return httpd_resp_send_500(req);
    snprintf(page, 3072,
             "<!doctype html><html lang=pt-br><head>%s<title>Configurar</title></head><body>"
             "<h2>Configurar</h2><form method=post action=/config>"
             "<label>URL do servidor<input name=url value=\"%s\"></label>"
             "<small>ex.: http://192.168.1.6:8080/api/gate/entry</small>"
             "<label>Servo 360: tempo de giro (ms)<input name=move_ms type=number min=50 max=5000 "
             "step=10 value=%d></label>"
             "<label>Servo 360: sentido de abrir<select name=dir>"
             "<option value=1%s>normal</option><option value=-1%s>invertido</option></select></label>"
             "<p><button>Salvar</button> <a class='b g' href=/>Voltar</a></p></form>"
             "<p><small>Salvo na placa: continua valendo depois de reiniciar.</small></p>"
             "</body></html>",
             STYLE, url, s->move_ms, s->open_dir > 0 ? " selected" : "", s->open_dir < 0 ? " selected" : "");
    httpd_resp_set_type(req, "text/html; charset=utf-8");
    esp_err_t err = httpd_resp_sendstr(req, page);
    free(page);
    return err;
}

static void url_decode(char *s)
{
    char *o = s;
    for (; *s; s++) {
        if (*s == '+') {
            *o++ = ' ';
        } else if (*s == '%' && isxdigit((unsigned char)s[1]) && isxdigit((unsigned char)s[2])) {
            char hex[3] = {s[1], s[2], 0};
            *o++ = (char)strtol(hex, NULL, 16);
            s += 2;
        } else {
            *o++ = *s;
        }
    }
    *o = '\0';
}

static esp_err_t config_post_handler(httpd_req_t *req)
{
    char body[512];
    int total = 0;
    while (total < req->content_len && total < (int)sizeof(body) - 1) {
        int r = httpd_req_recv(req, body + total, sizeof(body) - 1 - total);
        if (r <= 0) return httpd_resp_send_500(req);
        total += r;
    }
    body[total] = '\0';

    settings_t s = *settings_get();
    char val[160];
    if (httpd_query_key_value(body, "url", val, sizeof(val)) == ESP_OK) {
        url_decode(val);
        if (strncmp(val, "http://", 7) == 0 || strncmp(val, "https://", 8) == 0) {
            strlcpy(s.server_url, val, sizeof(s.server_url));
        }
    }
    if (httpd_query_key_value(body, "move_ms", val, sizeof(val)) == ESP_OK) {
        int v = atoi(val);
        if (v >= 50 && v <= 5000) s.move_ms = v;
    }
    if (httpd_query_key_value(body, "dir", val, sizeof(val)) == ESP_OK) {
        s.open_dir = atoi(val) < 0 ? -1 : 1;
    }
    if (settings_save(&s) != ESP_OK) return httpd_resp_send_500(req);

    httpd_resp_set_status(req, "303 See Other");
    httpd_resp_set_hdr(req, "Location", "/config");
    return httpd_resp_send(req, NULL, 0);
}

void web_start(void)
{
    httpd_config_t cfg = HTTPD_DEFAULT_CONFIG();
    cfg.stack_size = 8192;
    httpd_handle_t server = NULL;
    if (httpd_start(&server, &cfg) != ESP_OK) {
        ESP_LOGE(TAG, "falha ao iniciar o servidor web");
        return;
    }
    const httpd_uri_t uris[] = {
        {.uri = "/", .method = HTTP_GET, .handler = index_handler},
        {.uri = "/capture", .method = HTTP_GET, .handler = capture_handler},
        {.uri = "/gate", .method = HTTP_GET, .handler = gate_handler},
        {.uri = "/config", .method = HTTP_GET, .handler = config_get_handler},
        {.uri = "/config", .method = HTTP_POST, .handler = config_post_handler},
    };
    for (size_t i = 0; i < sizeof(uris) / sizeof(uris[0]); i++) {
        httpd_register_uri_handler(server, &uris[i]);
    }
    ESP_LOGI(TAG, "página da câmera ativa (porta 80)");
}
