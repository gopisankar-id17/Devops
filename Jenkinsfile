pipeline {
    agent any

    tools {
        nodejs "NodeJS"   // Make sure this name exists in Jenkins → Global Tool Configuration
    }

    environment {
        DOCKER_IMAGE = "gopins/devops-node-app"
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
                    sh '''
                    echo $DOCKER_PASS | docker login -u $DOCKER_USER --password-stdin
                    docker push $DOCKER_IMAGE
                    '''
                }
            }
        }

        stage('Deploy (Local VM)') {
            steps {
                sh '''
                docker pull $DOCKER_IMAGE

                # Stop old container if exists
                docker stop devops-node-app || true
                docker rm devops-node-app || true

                # Stop ANY container using port 80 (fix for your error)
                docker ps -q --filter "publish=80" | xargs -r docker stop

                # Run new container
                docker run -d -p 80:3000 --name devops-node-app $DOCKER_IMAGE
                '''
            }
        }

    }

    post {
        success {
            echo "Deployment successful 🚀"
        }
        failure {
            echo "Pipeline failed ❌"
        }
    }
}