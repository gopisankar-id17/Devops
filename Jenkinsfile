pipeline {
agent any

```
tools {
    nodejs "NodeJS-18"
}

environment {
    DOCKER_IMAGE = "gopins/devops-node-app"
    VM_IP = "35.232.96.219"
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
            bat 'docker push %DOCKER_IMAGE%'
        }
    }

    stage('Deploy to GCP VM') {
        steps {
            bat """
            ssh %VM_USER%@%VM_IP% ^
            "docker stop nodeapp || true && ^
            docker rm nodeapp || true && ^
            docker pull %DOCKER_IMAGE% && ^
            docker run -d -p 3000:3000 --name nodeapp %DOCKER_IMAGE%"
            """
        }
    }
}

post {
    success {
        echo 'Deployment Successful 🚀'
    }
    failure {
        echo 'Pipeline Failed ❌'
    }
}
```

}
