#!/bin/bash
# loads .env and starts both the Spring backend and Expo frontend

set -a
source .env
set +a

echo "Starting Spring Boot backend..."
cd spring-server
mvn spring-boot:run &
BACKEND_PID=$!

echo "Starting Expo frontend..."
cd ..
npx expo start --android &
FRONTEND_PID=$!

echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "Press Ctrl+C to stop both"

wait
