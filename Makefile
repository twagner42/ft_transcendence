# Documentation
################################################################################
## 
## 
## +make build:
##  Usage: make build [ dev | prod | testing ].
##  Builds a choosen enviroment using docker-compose. Accepts either of these 
##  three arguments:
##  - dev to build a development environment.
##  - prod to build a production environment.
##  - test to build a testing environment where you can run tests.
##  When nothing is specified, defaults to building prod.
## 
## +make test:
##  Usage: make test [ client | server ] [ int | e2e ].
##  Runs tests on the testing environment built with 'make build test'.
##  Example: make test server int, make test client e2e.
## 
## +make clean, fclean:
##  Usage: make [ clean | fclean ].
##  Clean Stops all running containers and remove the images and volumes.
##  Fclean does all of the above and deletes the folder node_modulesfrom the 
##  server and the client directories, deletes the networks and prunes the 
##  system.
## 
## +make stop:
##  Stops all running containers.
## 

# Commands
################################################################################
RM				:= rm -rf
CD				:= cd
DOCKER			:= docker
DOCKERIMG		:= docker image
DCOMPOSE		:= docker-compose
TOUCH			:= touch
MKDIR			:= mkdir -p
REPLACE			:= sed -i
UNAME_S			:= $(shell uname -s)
PRINT			:= echo

# Colors 
################################################################################
GREEN        	= \033[1;32m
BLUE			= \033[1;34m
CYAN        	= \033[1;36m
RESET		 	= \033[0m

# Sources
################################################################################
DCOMPOSEFILE	= docker-compose.yml

# Directories
################################################################################
SRCS			:= ./srcs

# Environments
################################################################################

ifeq ($(UNAME_S),Darwin)
	REPLACE = sed -i'' -e
endif

ARGS := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
ifeq (build,$(firstword $(MAKECMDGOALS)))
    BUILD_ENV := $(word 1, $(ARGS))
    $(eval $(ARGS):;@:)
else ifeq (clean, $(firstword $(MAKECMDGOALS)))
    BUILD_ENV := $(word 1, $(ARGS))
    $(eval $(ARGS):;@:)
else ifeq (fclean, $(firstword $(MAKECMDGOALS)))
    BUILD_ENV := $(word 1, $(ARGS))
    $(eval $(ARGS):;@:)
else ifeq (stop, $(firstword $(MAKECMDGOALS)))
    BUILD_ENV := $(word 1, $(ARGS))
    $(eval $(ARGS):;@:)
else ifeq (test,$(firstword $(MAKECMDGOALS)))
    CLIENT_OR_SERVER := $(word 1,$(ARGS))
    TEST_TYPE := $(word 2,$(ARGS))
    $(eval $(ARGS):;@true:)
endif

ifeq ($(BUILD_ENV), dev)
	DCOMPOSEFILE	= docker-compose.dev.yml
	ENVFILE			= .env.dev
	RUNNING_ENV		= dev
else ifeq ($(BUILD_ENV), testing)
	DCOMPOSEFILE	= docker-compose.dev.yml
	ENVFILE			= .env.dev
	RUNNING_ENV		= test.int
else
	DCOMPOSEFILE	= docker-compose.yml
	ENVFILE			= .env
	RUNNING_ENV		= prod
endif

# Executables & libraries
################################################################################
NAME			:= .done
SERVER			:= $(SRCS)/server
CLIENT			:= $(SRCS)/client
DATABASE		:= $(SRCS)/database

# Flags
################################################################################
UP				:= up --build -d
DOWN			:= down
REMOVEALL		:= --rmi all --remove-orphans -v

# Global Rule
################################################################################
$(NAME):		
				@touch $(NAME)

.PHONY:			all
all:			build

.PHONY:			build
build:			$(NAME)
				$(REPLACE) "s/RUNNING_ENV=.*/RUNNING_ENV=${RUNNING_ENV}/" \
					$(SRCS)/$(ENVFILE)
				$(DCOMPOSE) -f $(SRCS)/$(DCOMPOSEFILE) \
					--env-file $(SRCS)/$(ENVFILE) $(UP)

# Tests
################################################################################
.PHONY:			test
test:
				docker exec -w /app $(CLIENT_OR_SERVER) npm run test:$(TEST_TYPE)

# Stop & Cleaning Rules
################################################################################
.PHONY:			stop
stop:					
				$(DCOMPOSE) -f $(SRCS)/$(DCOMPOSEFILE) \
					--env-file $(SRCS)/$(ENVFILE) $(DOWN)

.PHONY:			clean
clean:
				# Stops containers and remove images + volumes
				$(DCOMPOSE) -f $(SRCS)/$(DCOMPOSEFILE) \
					--env-file $(SRCS)/$(ENVFILE) $(DOWN) $(REMOVEALL)	
				$(RM) .done

.PHONY:			fclean
fclean:			clean cleandocker cleannode

.PHONY:			cleandocker
cleandocker:	
				# Clean all : stops containers, remove images, volumes, network
				$(DOCKER) system prune --all --force --volumes
				$(DOCKER) network prune --force
				$(DOCKER) volume prune --force
				$(DOCKER) image prune --force

.PHONY:			cleannode
cleannode:		
				# clean node_modules
				$(RM) $(CLIENT)/node_modules
				$(RM) $(SERVER)/node_modules

.PHONY:			re
re:				fclean all

# Help & documentation
################################################################################
.PHONY:			help
help:
				@sed -ne '/@sed/!s/## //p' $(MAKEFILE_LIST) | \
				while read -r line; do \
					awk ' \
					{ \
						if ($$line ~ /\+/) \
						{ \
							printf "$(BLUE)%s$(RESET)\n", substr($$line,2) \
						} \
						else \
						{ \
							printf "%s\n", $$line \
						} \
					}'; \
				done
