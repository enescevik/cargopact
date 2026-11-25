# Agents

Strands orkestratör + uzman ajanlar, AgentCore Runtime üzerinde çalışır.

## Deploy (iki aşama)
1. `npm run deploy -w @cargopact/infra` (ECR, Memory, rol, API, web)
2. İmajı arm64 olarak derle ve ECR'a gönder:
   ```bash
   REPO=$(aws cloudformation describe-stacks --stack-name CargoPact-Agents --query "Stacks[0].Outputs[?OutputKey=='AgentRepoUri'].OutputValue" --output text)
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ${REPO%%/*}
   docker buildx build --platform linux/arm64 -t $REPO:v1 --push agents/
   ```
3. `cd infra && npx cdk deploy --all -c agentImageTag=v1` (Runtime oluşur, API ARN'ye bağlanır)
