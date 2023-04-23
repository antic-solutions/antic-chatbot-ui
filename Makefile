include .env

# Define the name of the builder instance.
BUILDER_NAME = mybuilder

# Define the name of the Docker image and tag.
DOCKER_USER = wallter
IMAGE_NAME = "${DOCKER_USER}/antic-chatbot-ui"
IMAGE_TAG = latest

# Define the list of platforms to build for.
PLATFORMS = linux/amd64,linux/arm64

# Define the Docker driver to use.
DRIVER = docker-container

# Define the build command.
BUILD_CMD = docker buildx build --platform $(PLATFORMS) -t $(IMAGE_NAME):$(IMAGE_TAG) --push .


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
	@if ! docker buildx inspect $(BUILDER_NAME) > /dev/null 2>&1 ; then \
		echo "🆕 Creating builder instance $(BUILDER_NAME) using driver $(DRIVER)" ; \
		docker buildx create --name $(BUILDER_NAME) --driver $(driver) ; \
	else \
		echo "👌 Builder instance $(BUILDER_NAME) already exists" ; \
	fi

	docker buildx use $(BUILDER_NAME) ;

	echo "🪚 Building and pushing Docker image using build command $(BUILD_CMD)" ;
	$(BUILD_CMD) ;

	echo "✅ Finished building and pushing Docker image $(IMAGE_NAME):$(IMAGE_TAG)" ;

	echo "🧹 Stopping builder instance $(BUILDER_NAME)" ;
	docker stop buildx_buildkit_mybuilder0 ;