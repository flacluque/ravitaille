# Image unique : l'API Spring Boot sert aussi le front (React construit par Vite).
# docker build -t trail-planner . && docker run -p 8080:8080 trail-planner

FROM node:22-alpine AS front
WORKDIR /front
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM maven:3.9-eclipse-temurin-21 AS back
WORKDIR /app
COPY pom.xml ./
RUN mvn -q -B dependency:go-offline
COPY src ./src
COPY --from=front /front/dist ./src/main/resources/static
RUN mvn -q -B package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S trail && adduser -S trail -G trail
COPY --from=back /app/target/trail-planner-*.jar app.jar
USER trail
EXPOSE 8080
# Petite machine (512 Mo sur l'offre gratuite de Render) : mémoire de la JVM bornée.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -XX:+UseSerialGC -Xss512k -XX:TieredStopAtLevel=1"
ENTRYPOINT ["java", "-jar", "app.jar"]
