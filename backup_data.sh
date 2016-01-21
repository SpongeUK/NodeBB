#! /bin/sh
path="/home/forum-farmfoods-01/projects/NodeBB/backups/"
date=$(date +'%s')
filepath=$path$date
source="/var/lib/redis/redis.rdb"
echo "Copying $source to $filepath"
sudo cp $source $filepath
cd $path
echo "Clearing old backups"
ls -tp | grep -v '/'| tail -n +8 | xargs -I {} rm -- {}