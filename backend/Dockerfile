FROM maven:3.9-eclipse-temurin-17

WORKDIR /app

COPY pom.xml .
COPY mvnw .
COPY .mvn .mvn
RUN chmod +x mvnw

COPY src ./src

# Bind-mounted over by docker-compose in dev, so "clean" here also covers a
# fresh checkout with no volume attached (e.g. `docker build` standalone).
CMD ["./mvnw", "clean", "spring-boot:run", "-DskipTests"]
