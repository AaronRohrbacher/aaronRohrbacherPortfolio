#! /usr/bin/bash
aws s3 rm s3://aaronrohrbacher-com-e/ --recursive
cd build
echo "$(eval pwd)"
aws s3 cp . s3://aaronrohrbacher-com-e/ --recursive
aws cloudfront create-invalidation \
    --distribution-id ET0GBT55PBOVR \
    --paths "/*"
