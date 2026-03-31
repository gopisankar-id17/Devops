pipeline {
    agent any

    tools {
        nodejs "NodeJS"
    }

    environment {
        DOCKER_IMAGE = "gopins/devops-node-app"
        VM_IP = "35.188.219.161"
        VM_USER = "gopins172"
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

        stage('Deploy') {
    steps {
        sh 'ssh $VM_USER@$VM_IP docker pull $DOCKER_IMAGE'
        sh 'ssh $VM_USER@$VM_IP "docker stop myapp || true"'
        sh 'ssh $VM_USER@$VM_IP "docker rm myapp || true"'
        sh 'ssh $VM_USER@$VM_IP "docker run -d --name myapp -p 80:3000 $DOCKER_IMAGE"'
    }
}
    }
}
