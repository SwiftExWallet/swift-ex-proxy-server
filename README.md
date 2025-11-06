<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ yarn install
```

## Compile and run the project

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

## Run tests

```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

## AWS SSM Parameter Management

This project uses AWS Systems Manager (SSM) Parameter Store to manage environment variables. Parameters are fetched at runtime by the container.

### Configuration Files

- **`constants.sh`** - Defines environment configuration (environment name, component name, AWS region, etc.)
- **`ssmvalues.json`** - Contains parameter values to be set in SSM Parameter Store
- **`setssmparameter.sh`** - Script to set/update SSM parameters from local JSON file

### Setting SSM Parameters

#### 1. Create `ssmvalues.json` file

Since `ssmvalues.json` is gitignored (contains sensitive data), you need to create it manually:

```bash
# Create the file from the template
cp ssmvalues.json.example ssmvalues.json

# OR create it manually
touch ssmvalues.json
```

Then edit it with your actual values (see step 3 below for the structure).

#### 2. Update `constants.sh` (if needed)

The default values are:
```bash
ENVIRONMENT_NAME=dev
COMPONENT_NAME=swiftx
PART_NAME=proxy
AWS_REGION=ap-south-1
```

You can override these by setting environment variables:
```bash
export ENVIRONMENT_NAME=prod
export AWS_REGION=us-east-1
```

#### 3. Edit `ssmvalues.json` with your values

Add your parameter values to the JSON file:

```json
{
  "REDIS_HOST": {
    "value": "your-redis-host",
    "type": "String"
  },
  "REDIS_PWD": {
    "value": "your-secure-password",
    "type": "SecureString"
  },
  "PROVIDER_RPC_ETH": {
    "value": "https://eth-sepolia.g.alchemy.com/v2/your_api_key",
    "type": "String"
  }
}
```

**Parameter Types:**
- `String` - Regular string value
- `SecureString` - Encrypted value (recommended for secrets)

**Note:** A template file `ssmvalues.json.example` is provided in the repository with placeholder values. Copy it to `ssmvalues.json` and update with your actual values.

#### 4. Run the Script

```bash
# With AWS profile
./setssmparameter.sh -p swiftx-dev

# With custom JSON file
./setssmparameter.sh -p swiftx-dev -f custom-values.json

# Show help
./setssmparameter.sh --help
```

#### How It Works

- **SSM Path Pattern**: `/${ENVIRONMENT_NAME}/${COMPONENT_NAME}/${PART_NAME}/${VARIABLE_NAME}`
- **Example**: `/dev/swiftx/proxy/REDIS_HOST`
- The script will:
  - ✅ Create new parameters if they don't exist
  - ✅ Update existing parameters if they exist (using `--overwrite`)
  - ✅ Show summary of created/updated parameters

#### Prerequisites

- AWS CLI installed and configured
- `jq` installed (`brew install jq` on macOS, `apt-get install jq` on Linux)
- AWS credentials with SSM permissions
- `ssmvalues.json` file in the project root

#### Important Notes

- ⚠️ **Never commit `ssmvalues.json` to git** - Add it to `.gitignore`
- 🔒 Use `SecureString` type for sensitive values (passwords, API keys, etc.)
- 📝 The script uses `--overwrite` flag, so existing parameters will be updated
- 🌍 Parameters are fetched at runtime by `start.sh` in the container

### Fetching SSM Parameters (Local Development)

To fetch SSM parameters and create a local `.env` file:

```bash
# Fetch all parameters and create .env file
./fetch-ssm.sh -p swiftx-dev

# Fetch to a custom file
./fetch-ssm.sh -p swiftx-dev -o .env.local
```

### Local Development Setup

The `setup.sh` script automates the complete local development workflow:

```bash
# Full setup: fetch SSM, build image, push to ECR
./setup.sh -p swiftx-dev

# Build with custom tag
./setup.sh -p swiftx-dev -t v1.0.0

# Skip build (only fetch and push existing image)
./setup.sh -p swiftx-dev --skip-build

# Skip push (only fetch and build, don't push)
./setup.sh -p swiftx-dev --skip-push
```

**What `setup.sh` does:**
1. ✅ Fetches SSM parameters and creates `.env` file
2. ✅ Builds Docker image locally
3. ✅ Logs into ECR
4. ✅ Tags image for ECR
5. ✅ Pushes image to ECR repository

**ECR Repository Format:**
- Repository Name: `${ENVIRONMENT_NAME}-${COMPONENT_NAME}-${PART_NAME}-ecr`
- Example: `dev-swiftx-proxy-ecr`
- Full URI: `${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/dev-swiftx-proxy-ecr:latest`

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ yarn install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
