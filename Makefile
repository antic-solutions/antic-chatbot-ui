include .env

DOCKER_BUILDX_NAME ?= desktop-linux
SERVICE_NAME ?= chatbot-ui
IMAGE_TAG ?= $(shell git rev-parse --short HEAD)

# Define these variables in .env
# SERVICE_NAME=
# DOCKER_USER=
# IMAGE_TAG=(optional) defaults to git commit hash


.PHONY: all

up:
	@docker compose --env-file .env up -d

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


	@docker buildx build \
		--platform linux/amd64 \
		--push \
		-t ${DOCKER_USER}/${SERVICE_NAME}:$(IMAGE_TAG) \
		--push \
		-f ./Dockerfile .;

clean:
	docker buildx rm 

prune:
	docker system prune -a --volumes


	# @docker pull ${SERVICE_NAME}/${SERVICE_NAME}:${IMAGE_TAG}
	# @docker tag  ${SERVICE_NAME}/${SERVICE_NAME}:${IMAGE_TAG} ${SERVICE_NAME}/${SERVICE_NAME}:latest