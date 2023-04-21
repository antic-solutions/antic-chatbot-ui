include .env

.PHONY: all

build:
	docker build -t antic-chatbot-ui .

run:
	export $(cat .env | xargs)
	docker stop antic-chatbot-ui || true && docker rm antic-chatbot-ui || true
	docker run --name antic-chatbot-ui --rm -e OPENAI_API_KEY=${OPENAI_API_KEY} -p 3000:3000 antic-chatbot-ui

logs:
	docker logs -f antic-chatbot-ui

push:
	@echo "Building for linux/amd64 (x86_64), linux/arm64 (aarch64 or armv8 or M1 Macs))"
	docker buildx build --platform linux/amd64,linux/arm64 -t ${DOCKER_USER}/antic-chatbot-ui:${DOCKER_TAG} . 
	docker push ${DOCKER_USER}/antic-chatbot-ui:${DOCKER_TAG}
