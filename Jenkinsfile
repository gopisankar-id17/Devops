pipeline {
    agent any

    tools {
        nodejs "NodeJS-18"
    }

    environment {
        DOCKER_IMAGE = "gopins/devops-node-app"
        VM_IP = "35.188.219.161"
        VM_USER = "gopins172"
    }

    stages {

        stage('Checkout Code') {
            steps {
                git 'https://github.com/gopisankar-id17/Devops.git'
            }
        }

        stage('Install Dependencies') {
            steps {
                bat 'npm install'
            }
        }

        stage('Run Tests') {
            steps {
                bat 'npm test'
            }
        }

        stage('Build Docker Image') {
            steps {
                bat 'docker build -t %DOCKER_IMAGE% .'
            }
        }

        stage('Push Image to DockerHub') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-creds',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    bat 'docker login -u %DOCKER_USER% -p %DOCKER_PASS%'
                    bat 'docker push %DOCKER_IMAGE%'
                }
            }
        }

        stage('Deploy') {
            steps {
                bat "ssh %VM_USER%@%VM_IP% docker pull %DOCKER_IMAGE%"
                bat "ssh %VM_USER%@%VM_IP% docker stop myapp || true"
                bat "ssh %VM_USER%@%VM_IP% docker run -d --name myapp -p 80:3000 %DOCKER_IMAGE%"
            }
        }
    }
}