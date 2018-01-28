const { events, Job, Group } = require('brigadier')

events.on("push", (brigadeEvent, project) => {
    
    // slack announcement
    /*
    var slack = new Job("slack-notify", "technosophos/slack-notify:latest", ["/slack-notify"])
    slack.storage.enabled = false
    slack.env = {
      SLACK_WEBHOOK: proj.secrets.slackWebhook,
      SLACK_USERNAME: "brigade-demo",
      SLACK_MESSAGE: "rating-web github webhook felt....",
      SLACK_COLOR: "#ff0000"
    }
	slack.run()
    */

    // setup variables
    var gitPayload = JSON.parse(brigadeEvent.payload)
    var brigConfig = new Map()
    brigConfig.set("acrServer", project.secrets.acrServer)
    brigConfig.set("acrUsername", project.secrets.acrUsername)
    brigConfig.set("acrPassword", project.secrets.acrPassword)
    brigConfig.set("webImage", "squillace.azurecr.io/squillace/rating-web")
    brigConfig.set("gitSHA", brigadeEvent.commit.substr(0,7))
    brigConfig.set("eventType", brigadeEvent.type)
    brigConfig.set("branch", getBranch(gitPayload))
    var today = new Date()
    brigConfig.set("buildDate", today.toISOString().substring(0, 10))
    brigConfig.set("imageTag", `${brigConfig.get("branch")}-${brigConfig.get("gitSHA")}`)
    brigConfig.set("webACRImage", `${brigConfig.get("acrServer")}/${brigConfig.get("webImage")}`)
    
    console.log(`==> gitHub webook (${brigConfig.get("branch")}) with commit ID ${brigConfig.get("gitSHA")}`)
    console.log(`==> Date ${brigConfig.get("buildDate")}`)

    // setup brigade jobs
    var docker = new Job("job-runner-docker")
    var helm = new Job("job-runner-helm")
    dockerJobRunner(brigConfig, docker)
    helmJobRunner(brigConfig, helm, "prod")
    
    // start pipeline
    console.log(`==> starting pipeline for docker image: ${brigConfig.get("webACRImage")}:${brigConfig.get("imageTag")}`)
    var pipeline = new Group()
    pipeline.add(docker)
    pipeline.add(helm)
    if (brigConfig.get("branch") == "master") {
        pipeline.runEach()
    } else {
        console.log(`==> no jobs to run when not master`)
    }  
})

events.on("after", (event, proj) => {
    console.log("brigade pipeline finished successfully")

    var slack = new Job("slack-notify", "technosophos/slack-notify:latest", ["/slack-notify"])
    slack.storage.enabled = false
    slack.env = {
      SLACK_WEBHOOK: proj.secrets.slackWebhook,
      SLACK_USERNAME: "brigade-demo",
      SLACK_MESSAGE: "brigade pipeline finished successfully",
      SLACK_COLOR: "#ff0000"
    }
	slack.run()
    
})

function dockerJobRunner(config, d) {
    d.storage.enabled = false
    d.image = "chzbrgr71/dockernd:node"
    d.privileged = true
    d.tasks = [
        "dockerd-entrypoint.sh &",
        "echo waiting && sleep 20",
        "cd /src/",
        `docker login ${config.get("acrServer")} -u ${config.get("acrUsername")} -p ${config.get("acrPassword")}`,
        `docker build --build-arg BUILD_DATE=${config.get("buildDate")} --build-arg IMAGE_TAG_REF=${config.get("imageTag")} --build-arg VCS_REF=${config.get("gitSHA")} -t ${config.get("webImage")} .`,
        `docker tag ${config.get("webImage")} ${config.get("webACRImage")}:${config.get("imageTag")}`,
        `docker push ${config.get("webACRImage")}:${config.get("imageTag")}`,
        "killall dockerd"
    ]
}

function helmJobRunner (config, h, deployType) {
    h.storage.enabled = false
    h.image = "chzbrgr71/k8s-helm:v2.7.2"
    h.tasks = [
        "cd /src/",
        "git clone https://github.com/squillace/draft-packs.git",
        "cd draft-packs/packs",
        `helm upgrade --install rating-web ./rating-web --set web.image=${config.get("webACRImage")} --set web.imageTag=${config.get("imageTag")}`
    ]
}

function slackJob (s, webhook, message) {
    s.storage.enabled = false
    s.env = {
      SLACK_WEBHOOK: webhook,
      SLACK_USERNAME: "brigade-demo",
      SLACK_MESSAGE: message,
      SLACK_COLOR: "#0000ff"
    }
}

function getBranch (p) {
    if (p.ref) {
        return p.ref.substring(11)
    } else {
        return "PR"
    }
}