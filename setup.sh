#!/bin/bash

cd ~/Desktop/documind-rapports
cp ../documind/.env .env
cp ../documind/backend/.env.local backend/.env.local
cp ../documind/my-react-app/.env my-react-app/.env
echo 'APP_EDITION=rapports' >> .env
echo 'VITE_EDITION=rapports' >> my-react-app/.env
