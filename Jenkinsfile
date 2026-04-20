pipeline {
    agent any

    tools {
        nodejs "NodeJS-18"
    }

    environment {
        DOCKER_IMAGE = "gopins/devops-node-app"
        VM_IP        = "35.188.219.161"
        VM_USER      = "gopins172"
    }

    stages {

        stage('Install Dependencies') {
            steps {
                sh 'npm install'
            }
        }

        stage('Run Tests') {
            steps {
                sh 'npm test'
            }
        }

        stage('Build Docker Image') {
            steps {
                sh 'docker build -t $DOCKER_IMAGE .'
            }
        }

        stage('Push Image to DockerHub') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-creds',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    sh 'docker login -u $DOCKER_USER -p $DOCKER_PASS'
                    sh 'docker push $DOCKER_IMAGE'
                }
            }
        }

        stage('Deploy to GCP VM') {
            steps {
                sh 'ssh $VM_USER@$VM_IP "cd ~/app && git pull"'
                sh 'ssh $VM_USER@$VM_IP "cd ~/app && docker compose down"'
                sh 'ssh $VM_USER@$VM_IP "cd ~/app && docker compose pull"'
                sh 'ssh $VM_USER@$VM_IP "cd ~/app && docker compose up -d"'
            }
        }

    }

    post {
        success {
            echo "Deployment successful - build #${BUILD_NUMBER}"
        }
        failure {
            echo "Pipeline failed - check logs"
        }
    }
}
