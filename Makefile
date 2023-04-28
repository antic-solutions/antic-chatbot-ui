include .env.local

DOCKER_BUILDX_NAME ?= desktop-linux
SERVICE_NAME ?= chatbot-ui
IMAGE_TAG ?= $(shell git rev-parse --short HEAD)

# Define these variables in .env.local
# SERVICE_NAME=
# DOCKER_USER=
# IMAGE_TAG=(optional) defaults to git commit hash


.PHONY: all

up:
	@docker compose up -d

run:
	export $(cat .env | xargs)
	docker stop ${SERVICE_NAME} || true && docker rm ${SERVICE_NAME} || true
	docker run --name ${SERVICE_NAME} --rm -e OPENAI_API_KEY=${OPENAI_API_KEY} -p 3000:3000 ${SERVICE_NAME}

restart: 
	docker compose restart

down: 
	@docker compose down

logs:
	@docker compose logs -f 

build:
	@docker build --tag ${SERVICE_NAME}:${IMAGE_TAG} .
	
push:
	@if [[ -z `docker buildx ls | grep ${DOCKER_BUILDX_NAME}` ]]; then \
		@docker buildx create --use --name ${DOCKER_BUILDX_NAME}
	fi

	@docker context use ${DOCKER_BUILDX_NAME}
	@docker buildx use ${DOCKER_BUILDX_NAME} 

	@docker pull ${DOCKER_USERNAME}/${SERVICE_NAME}:${GIT_HASH}
	@docker tag  ${DOCKER_USERNAME}/${SERVICE_NAME}:${GIT_HASH} ${DOCKER_USERNAME}/${SERVICE_NAME}:latest

	@docker buildx build \
		--platform linux/amd64 \
		--push \
		-t ${DOCKER_USER}/${SERVICE_NAME}:$(IMAGE_TAG) \
		--push \
		-f ./Dockerfile.prod .

clean:
	docker buildx rm 