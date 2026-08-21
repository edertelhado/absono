FROM eclipse-temurin:17-jdk AS build
WORKDIR /app

COPY gradlew gradlew.bat settings.gradle build.gradle gradle.properties ./
COPY gradle/ gradle/
COPY src/ src/

RUN chmod +x gradlew && ./gradlew bootJar --no-daemon -x test \
    && mv build/libs/*.jar app.jar

FROM eclipse-temurin:17-jre
WORKDIR /app

COPY --from=build /app/app.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
