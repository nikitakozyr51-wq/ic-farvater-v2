# IC Фарватер — production image
# Base: PHP 8.2 + Apache (совместимо с .htaccess + scripts/send.php)
# Dokploy/Coolify будет билдить этот Dockerfile из репозитория автоматически.

FROM php:8.2-apache

# Системные утилиты (curl, ca-certificates для SMTP, unzip + git для composer)
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates unzip git \
    && rm -rf /var/lib/apt/lists/*

# Composer (для установки PHPMailer)
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Apache модули (mod_rewrite, headers, expires, deflate — нужны для .htaccess)
RUN a2enmod rewrite headers expires deflate

# Разрешаем .htaccess переопределять всё (AllowOverride None → All)
RUN sed -i 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf

# PHP конфиг (upload limits для KP-формы)
RUN { \
    echo "upload_max_filesize = 10M"; \
    echo "post_max_size = 12M"; \
    echo "max_file_uploads = 5"; \
    echo "memory_limit = 64M"; \
    echo "expose_php = Off"; \
    } > /usr/local/etc/php/conf.d/icfarvater.ini

WORKDIR /var/www/html

# Сначала composer.json — для кэширования слоя vendor (пересобираем только при изменении deps)
COPY composer.json composer.lock* ./
RUN composer install --no-dev --no-interaction --optimize-autoloader --no-scripts

# Потом — всё остальное приложение
COPY --chown=www-data:www-data . /var/www/html/
# Vendor мог перезаписаться предыдущей COPY — восстанавливаем
RUN composer install --no-dev --no-interaction --optimize-autoloader --no-scripts \
    && chown -R www-data:www-data vendor

EXPOSE 80

# Явно указываем CMD на случай если Dokploy UI попытается переопределить
CMD ["apache2-foreground"]
