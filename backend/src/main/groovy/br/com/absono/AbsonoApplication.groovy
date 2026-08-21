package br.com.absono

import org.springframework.boot.SpringApplication
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.scheduling.annotation.EnableScheduling

@EnableScheduling
@SpringBootApplication
class AbsonoApplication {
    static void main(String[] args) {
        SpringApplication.run(AbsonoApplication, args)
    }
}
