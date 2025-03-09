aws s3 rm s3://aaronrohrbacher-com/ --recursive
cd build
echo "$(eval pwd)"
aws s3 cp . s3://aaronrohrbacher-com/ --recursive
aws cloudfront create-invalidation \
    --distribution-id E20WFU5AG9D8FI \
    --paths "/*"
