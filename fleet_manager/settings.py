import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

_DEFAULT_DEV_KEY = 'django-insecure-fleet-manager-dev-key-change-in-production'

DEBUG = os.environ.get('DJANGO_DEBUG', 'False').lower() in ('true', '1')

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', '' if not DEBUG else _DEFAULT_DEV_KEY)
if not SECRET_KEY:
    raise RuntimeError(
        'DJANGO_SECRET_KEY environment variable is required when DEBUG is off.'
    )

ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1' if not DEBUG else '*').split(',')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'django_celery_beat',
    'players',
    'deploy',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.locale.LocaleMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'fleet_manager.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'fleet_manager.wsgi.application'

if os.environ.get('DATABASE_URL') or os.environ.get('DB_ENGINE', '').startswith('django.db.backends.postgresql'):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('DB_NAME', 'fleet_manager'),
            'USER': os.environ.get('DB_USER', 'fleet_manager'),
            'PASSWORD': os.environ.get('DB_PASSWORD', 'fleet_manager'),
            'HOST': os.environ.get('DB_HOST', 'db'),
            'PORT': os.environ.get('DB_PORT', '5432'),
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Internationalization
LANGUAGE_CODE = 'en'

LANGUAGES = [
    ('en', 'English'),
    ('uk', 'Ukrainian'),
    ('fr', 'French'),
    ('de', 'German'),
    ('pl', 'Polish'),
]

LOCALE_PATHS = [BASE_DIR / 'locale']

USE_I18N = True
USE_TZ = True
TIME_ZONE = 'UTC'

# Static files
STATIC_URL = '/static/'
STATICFILES_DIRS = [BASE_DIR / 'static']
STATIC_ROOT = BASE_DIR / 'staticfiles'
STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
    },
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}

# Media files (user uploads)
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Allow large file uploads (500MB)
DATA_UPLOAD_MAX_MEMORY_SIZE = 500 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 500 * 1024 * 1024

# CSRF
CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get('CSRF_TRUSTED_ORIGINS', 'http://localhost:9000').split(',')
]

# REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 100,
}

CORS_ALLOW_ALL_ORIGINS = DEBUG

# Cache (used for distributed locks, e.g. poll dedup)
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0'),
    }
}

# Celery
CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0')
CELERY_RESULT_EXPIRES = 3600
CELERY_TASK_ROUTES = {
    'deploy.tasks.transcode_video': {'queue': 'transcode'},
    'deploy.tasks.generate_image_thumbnail': {'queue': 'transcode'},
}

# Fleet Manager settings
PLAYER_POLL_INTERVAL = int(os.environ.get('PLAYER_POLL_INTERVAL', '60'))
PLAYER_REQUEST_TIMEOUT = int(os.environ.get('PLAYER_REQUEST_TIMEOUT', '10'))

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# App version (set via Docker build args, fallback to changelog.ts)
APP_VERSION = os.environ.get('APP_VERSION', '').strip()
if not APP_VERSION or APP_VERSION == 'dev':
    try:
        import re as _re
        _changelog_path = os.path.join(BASE_DIR, 'static', 'src', 'changelog.ts')
        with open(_changelog_path) as _f:
            _m = _re.search(r"APP_VERSION\s*=\s*['\"]([^'\"]+)['\"]", _f.read())
            if _m:
                APP_VERSION = _m.group(1)
            else:
                APP_VERSION = 'dev'
    except Exception:
        APP_VERSION = 'dev'
BUILD_DATE = os.environ.get('BUILD_DATE', 'unknown')
