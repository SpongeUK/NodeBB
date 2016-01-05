#! /bin/sh
path="/home/forum-farmfoods-01/projects/NodeBB/backups/"
date=$(date +'%s')
filepath=$path$date
source="/var/lib/redis/redis.rdb"
echo "Copying $source to $filepath"
cp $source $filepath
