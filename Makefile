# COMMANDS
################################################################################
RM              := rm -rf
CD				:= cd
DOCKER			:= docker
DOCKERIMG		:= docker image
DCOMPOSE		:= docker compose
TOUCH			:= touch

# SOURCES
################################################################################
ENVFILE			= .env
DCOMPOSEFILE	= docker-compose.yml

# EXECUTABLES & LIBRARIES
################################################################################
NAME			:= .done

# DIRECTORIES
################################################################################
SRCS			:= ./srcs

# FLAGS
################################################################################
FLAGENV			:= --env-file
FLAGFILE		:= -f
UP				:= up -d
DOWN			:= down
REMOVEALL		:= --rmi all --remove-orphans -v

# RULES
################################################################################
$(NAME):		
				@touch $(NAME)

.PHONY:			all
all:			
				# Build images and run containers
				$(CD) $(SRCS) && $(DCOMPOSE) -f $(DCOMPOSEFILE) $(FLAGENV) $(ENVFILE) $(UP)	

.PHONY:			clean
clean:
				# Clean all : stops containers and remove images + volumes
				$(CD) $(SRCS) && $(DCOMPOSE) $(DOWN) $(REMOVEALL)
				$(RM) .done

.PHONY:			fclean
fclean:			clean 
				# Clean all : stops containers, remove images, volumes, network
				$(DOCKER) system prune --all --force --volumes
				$(DOCKER) network prune --force
				$(DOCKER) volume prune --force
				$(DOCKER) image prune --force

.PHONY:			dev
dev:			DCOMPOSEFILE = docker-compose.dev.yml
dev:			all

.PHONY:			re
re:				fclean all
