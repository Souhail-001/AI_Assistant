# AI Career Assistant Platform

## Running the Project

Now that the application is fully dockerized, you only need Docker installed on your machine to run it smoothly without manually setting up Python environments. 

### Start the Application
To start the application, open your terminal in the project directory (`/home/souhail/AI_Assistant`) and run:
```bash
docker compose up -d
```
The `-d` flag runs the server in the background. Note: the first time you run this, it will build the image which might take a few minutes as it downloads PyTorch and SpaCy NLP models.

### Access the Application
Once the container is running, open your web browser and go to:
- **Frontend App**: [http://localhost:8000/](http://localhost:8000/)
- **API Swagger Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **API Health Check**: [http://localhost:8000/api/health](http://localhost:8000/api/health)

### Stop the Application
To shut down the background server, run:
```bash
docker compose down
```

### Viewing Logs
If you want to debug or see what the server is doing in the background:
```bash
docker compose logs -f
```
