# Taşıyıcıya özel bilgi tabanı (Bedrock Knowledge Base)

- KB: `ATCPKGCFWE` (cargopact-carrier-kb), veri kaynağı `XH2SV330GL`, vektör deposu Amazon S3 Vectors (`cargopact-kb-283216208163` / index `carrier-kb`, 1024, cosine), gömme: Titan Text Embeddings V2.
- Doküman bucket'ı: `s3://cargopact-kb-283216208163/kb/<taşıyıcı>/`. Her `.md` için `.md.metadata.json` yan dosyası: `{"metadataAttributes":{"carrierId":"<uuid>","docType":"rules|summary"}}`.
- Taşıyıcı kimlikleri: Dinçer `5f41fc7c-2922-52a4-9380-04fdc41423a6`, Siva `93b64cea-58ed-5d09-82bf-8bb4c2b38f76`.
- Ham evrak ve kişisel veri indekslenmez; yalnızca kural metni ve kişisiz özet olaylar.
- Sunucu tarafı: ajan `carrier_knowledge` aracı `Retrieve` çağrısında `carrierId` süzgecini `/me` yanıtındaki `active.tenantId` ile uygular (mesajdan asla alınmaz); müşteri rolünde araç yoktur. Güncel adetler API'den (`trip_detail.verifiedNoShows`) gelir. KB erişilemezse `CARRIER_RULES` yedek metni kullanılır.

## Kurulum komutları (us-east-1, hesap 283216208163)
```
B=cargopact-kb-283216208163
aws s3 mb s3://$B
aws s3 sync docs/kb s3://$B/kb/ --exclude README.md
aws s3vectors create-vector-bucket --vector-bucket-name $B
aws s3vectors create-index --vector-bucket-name $B --index-name carrier-kb --data-type float32 \
  --dimension 1024 --distance-metric cosine \
  --metadata-configuration '{"nonFilterableMetadataKeys":["AMAZON_BEDROCK_TEXT","AMAZON_BEDROCK_METADATA"]}'
aws iam create-role --role-name cargopact-kb-role --assume-role-policy-document file://trust.json   # bedrock.amazonaws.com
aws iam put-role-policy --role-name cargopact-kb-role --policy-name kb --policy-document file://pol.json
  # s3:GetObject/ListBucket (kb/*), bedrock:InvokeModel (titan-embed-text-v2), s3vectors:* (index)
aws bedrock-agent create-knowledge-base --name cargopact-carrier-kb --role-arn arn:aws:iam::283216208163:role/cargopact-kb-role \
  --knowledge-base-configuration '{"type":"VECTOR","vectorKnowledgeBaseConfiguration":{"embeddingModelArn":"arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0","embeddingModelConfiguration":{"bedrockEmbeddingModelConfiguration":{"dimensions":1024,"embeddingDataType":"FLOAT32"}}}}' \
  --storage-configuration '{"type":"S3_VECTORS","s3VectorsConfiguration":{"indexArn":"arn:aws:s3vectors:us-east-1:283216208163:bucket/cargopact-kb-283216208163/index/carrier-kb"}}'
aws bedrock-agent create-data-source --knowledge-base-id ATCPKGCFWE --name kb-docs \
  --data-source-configuration '{"type":"S3","s3Configuration":{"bucketArn":"arn:aws:s3:::cargopact-kb-283216208163","inclusionPrefixes":["kb/"]}}'
aws bedrock-agent start-ingestion-job --knowledge-base-id ATCPKGCFWE --data-source-id XH2SV330GL
```
Doküman güncelleyince: `aws s3 sync ... --delete` + `start-ingestion-job`.
