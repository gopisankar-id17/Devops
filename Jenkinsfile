pipeline {
    agent any
    
    tools {
        nodejs "NodeJS-18"
    }

    stages {

        stage('Install Dependencies') {
            steps {
                sh 'npm install'
            }
        }

        stage('Run Application') {
            steps {
                sh 'node test.js'
            }
        }
    }
}