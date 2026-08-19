SHELL := /bin/bash

# ── OpenCode endpoint (из .env.local, по умолчанию 127.0.0.1:4096) ──────────
VITE_OPENCODE_BASE ?= $(shell grep -E '^VITE_OPENCODE_BASE=' .env.local 2>/dev/null | cut -d= -f2- | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$$//' -e 's/"//g' -e 's|/$$||')
OPENCODE_URL ?= $(if $(VITE_OPENCODE_BASE),$(VITE_OPENCODE_BASE),http://127.0.0.1:4096)
OPENCODE_PORT ?= $(shell echo "$(OPENCODE_URL)" | grep -oE '[0-9]+$$' || echo 4096)

# ── Цвета ─────────────────────────────────────────────────────────────────────
COLOR_RESET  := \033[0m
COLOR_BOLD   := \033[1m
COLOR_DIM    := \033[2m
COLOR_GREEN  := \033[32m
COLOR_YELLOW := \033[33m
COLOR_BLUE   := \033[34m
COLOR_MAGENTA:= \033[35m
COLOR_CYAN   := \033[36m
COLOR_RED    := \033[31m

# ── Помощь (target по умолчанию) ─────────────────────────────────────────────
.DEFAULT_GOAL := help

.PHONY: help
help: ## Показать это сообщение
	@printf "$(COLOR_BOLD)$(COLOR_CYAN)VibeTrace — доступные команды:$(COLOR_RESET)\n\n"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z0-9_:.-]+:.*?## / { \
		printf "$(COLOR_GREEN)  %-16s$(COLOR_RESET) %s\n", $$1, $$2 \
	}' $(MAKEFILE_LIST)
	@printf "\n$(COLOR_DIM)Запуск: npm install && make dev$(COLOR_RESET)\n"

.PHONY: install
install: ## Установить npm-зависимости
	@printf "$(COLOR_YELLOW)==> npm install$(COLOR_RESET)\n"
	@npm install

.PHONY: setup
setup: ## Создать .env.local из .env.example
	@if [ ! -f .env.local ]; then \
		printf "$(COLOR_YELLOW)==> cp .env.example .env.local$(COLOR_RESET)\n"; \
		cp .env.example .env.local; \
	else \
		printf "$(COLOR_DIM).env.local уже существует — пропускаем$(COLOR_RESET)\n"; \
	fi

.PHONY: serve
serve: ## Запустить OpenCode HTTP-сервер (opencode serve)
	@printf "$(COLOR_YELLOW)==> opencode serve$(COLOR_RESET)\n"
	@opencode serve

CHECK_OPCODE := curl -s -o /dev/null -w "%{http_code}" --max-time 2 "$(OPENCODE_URL)" 2>/dev/null

.PHONY: check-opencode
check-opencode: ## Проверить, запущен ли opencode serve (автозапуск при отсутствии)
	@printf "$(COLOR_YELLOW)==> Проверка opencode serve на $(OPENCODE_URL)...$(COLOR_RESET)\n"
	@if $(CHECK_OPCODE) | grep -qE '2[0-9][0-9]|3[0-9][0-9]'; then \
		printf "$(COLOR_GREEN)  opencode serve уже запущен ✓$(COLOR_RESET)\n"; \
	else \
		printf "$(COLOR_YELLOW)  opencode serve не найден — запускаю...$(COLOR_RESET)\n"; \
		nohup opencode serve --port $(OPENCODE_PORT) > /tmp/opencode-serve.log 2>&1 & \
		printf "$(COLOR_MAGENTA)  ждём поднятия сервера...$(COLOR_RESET)\n"; \
		for i in $$(seq 1 20); do \
			if $(CHECK_OPCODE) | grep -qE '2[0-9][0-9]|3[0-9][0-9]'; then \
				printf "$(COLOR_GREEN)  opencode serve запущен ✓ (лог: /tmp/opencode-serve.log)$(COLOR_RESET)\n"; \
				exit 0; \
			fi; \
			sleep 1; \
		done; \
		printf "$(COLOR_RED)  opencode serve не поднялся, лог: /tmp/opencode-serve.log$(COLOR_RESET)\n"; \
		exit 1; \
	fi

.PHONY: dev
dev: check-opencode ## Запустить dev-сервер Vite (http://localhost:5173)
	@printf "$(COLOR_YELLOW)==> npm run dev$(COLOR_RESET)\n"
	@npm run dev

.PHONY: dev-bg
dev-bg: check-opencode ## Запустить dev-сервер Vite в фоне
	@printf "$(COLOR_YELLOW)==> npm run dev (background)$(COLOR_RESET)\n"
	@nohup npm run dev > /tmp/vibetrace-dev.log 2>&1 &
	@sleep 2
	@printf "$(COLOR_GREEN)dev запущен: http://localhost:5173$(COLOR_RESET)\n"
	@printf "$(COLOR_DIM)лог: /tmp/vibetrace-dev.log$(COLOR_RESET)\n"

.PHONY: build
build: ## Собрать production-сборку
	@printf "$(COLOR_YELLOW)==> npm run build$(COLOR_RESET)\n"
	@npm run build

.PHONY: preview
preview: ## Превью production-сборки
	@printf "$(COLOR_YELLOW)==> npm run preview$(COLOR_RESET)\n"
	@npm run preview

.PHONY: lint
lint: ## Проверить код линтером (eslint)
	@printf "$(COLOR_YELLOW)==> npm run lint$(COLOR_RESET)\n"
	@npm run lint

.PHONY: smoke
smoke: ## Проверить живой opencode-демон
	@printf "$(COLOR_YELLOW)==> npm run smoke:opencode$(COLOR_RESET)\n"
	@npm run smoke:opencode

.PHONY: stop
stop: ## Остановить фоновые процессы (dev + opencode serve)
	@printf "$(COLOR_YELLOW)==> Остановка фоновых процессов$(COLOR_RESET)\n"
	@pkill -f "vite" 2>/dev/null && printf "$(COLOR_GREEN)  vite остановлен$(COLOR_RESET)\n" || printf "$(COLOR_RED)  vite не найден$(COLOR_RESET)\n"
	@pkill -f "opencode serve" 2>/dev/null && printf "$(COLOR_GREEN)  opencode serve остановлен$(COLOR_RESET)\n" || printf "$(COLOR_RED)  opencode serve не найден$(COLOR_RESET)\n"

.PHONY: status
status: ## Проверить статус фоновых процессов (dev + opencode serve)
	@printf "$(COLOR_YELLOW)==> Статус фоновых процессов$(COLOR_RESET)\n"
	@if curl -s -o /dev/null -w "%{http_code}" --max-time 2 "$(OPENCODE_URL)" 2>/dev/null | grep -qE '2[0-9][0-9]|3[0-9][0-9]'; then \
		printf "$(COLOR_GREEN)  opencode serve: запущен ($(OPENCODE_URL)) ✓$(COLOR_RESET)\n"; \
	else \
		printf "$(COLOR_RED)  opencode serve: НЕ запущен ($(OPENCODE_URL))$(COLOR_RESET)\n"; \
	fi
	@if curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:5173 2>/dev/null | grep -qE '2[0-9][0-9]|3[0-9][0-9]'; then \
		printf "$(COLOR_GREEN)  vite dev: запущен (http://localhost:5173) ✓$(COLOR_RESET)\n"; \
	else \
		printf "$(COLOR_RED)  vite dev: НЕ запущен (http://localhost:5173)$(COLOR_RESET)\n"; \
	fi

.PHONY: all
all: setup install ## Подготовить проект (setup + install)