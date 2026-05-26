# IC Фарватер — production image
# Base: PHP 8.2 + Apache (совместимо с .htaccess + scripts/send.php)
# Dokploy/Coolify будет билдить этот Dockerfile из репозитория автоматически.

FROM php:8.2-apache

# Включаем нужные Apache модули (mod_rewrite для редиректов,
# mod_headers/expires/deflate — для security/cache/gzip из .htaccess)
RUN a2enmod rewrite headers expires deflate

# Разрешаем .htaccess переопределять всё (AllowOverride All)
RUN sed -ri -e 's!<Directory /var/www/>.*!<Directory /var/www/>\n\tOptions Indexes FollowSymLinks\n\tAllowOverride All\n\tRequire all granted\n</Directory>!g' /etc/apache2/apache2.conf || true

# PHP конфиг (upload limits для KP-формы)
RUN { \
    echo "upload_max_filesize = 10M"; \
    echo "post_max_size = 12M"; \
    echo "max_file_uploads = 5"; \
    echo "memory_limit = 64M"; \
    echo "expose_php = Off"; \
    } > /usr/local/etc/php/conf.d/icfarvater.ini

# Копируем приложение. .dockerignore исключает dev-файлы.
COPY --chown=www-data:www-data . /var/www/html/

# Apache по умолчанию слушает :80, Dokploy проксирует :80 → внешний :443 через Traefik
EXPOSE 80

# Healthcheck — Dokploy перезапустит контейнер если страница не отвечает
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost/ > /dev/null || exit 1

# Явно указываем CMD на случай если Dokploy UI попытается переопределить
# (в Dokploy в Advanced → Run Command поле должно быть ПУСТЫМ, не "/bin/sh")
CMD ["apache2-foreground"]
