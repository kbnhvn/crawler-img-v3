const puppeteer = require('puppeteer');
const fs  = require('fs');
const { SlowBuffer } = require('buffer');
const util = require('util');
const { url } = require('inspector');

//Permet de gérer des prompts en console
const prompt = require('prompt-sync')();

//Site a vérifier
let websiteUrl = "";
let task = "";
let forceCheckUrl = "";

const urlList = [];
const urlTestedList = [];
const imgList = [];

//Récupération des infos en console
while(websiteUrl === ""){
    websiteUrl = prompt('URL du site à vérifier ? (sans http/s) : ');
}
while(task === ""){
  task = prompt('Element à vérifier ? pages/img/css/all : ');
}
if(fs.existsSync(websiteUrl+"/urlList.txt") && task !== 'pages'){
    while(forceCheckUrl === ""){
        forceCheckUrl = prompt('La liste des pages existe. Récupérer de nouveau la liste des pages ? oui/non : ');
    }
}

urlList.push('https://'+websiteUrl+'/')

function isBase64(str) {
    try {
        return btoa(atob(str)) == str;
    } catch (err) {
        return false;
    }
}

function mergeArrays(...arrays) {
    let jointArray = []

    arrays.forEach(array => {
        jointArray = [...jointArray, ...array]
    })
    const uniqueArray = jointArray.reduce((newArray, item) =>{
        if (newArray.includes(item)){
            return newArray
        } else {
            return [...newArray, item]
        }
    }, [])
    return uniqueArray
}

//Récupération des URL

const getAllUrl = async (browser, websiteUrl, urlList, arrayCssUsed, arrayCssUnused) => {
    if(urlList.length > 0){
        let page = await browser.newPage();
        // await page.setDefaultNavigationTimeout(0); 
        const url = urlList.shift();
        if(url){
            if(urlTestedList.includes(url)){
                return getAllUrl(browser, websiteUrl, urlList, arrayCssUsed, arrayCssUnused);
            }
            console.log('Check de l\'url : '+url);
            try {
                await page.goto(url);
            } catch (err) {
                console.error(err.message);
                return getAllUrl(browser, websiteUrl, urlList, arrayCssUsed, arrayCssUnused);
            }
            //Gestion de la page actu avec infinite scroll
            if(url === `https://${websiteUrl}/blog/` || `https://${websiteUrl}/actualites/`){
                await page.evaluate(() => new Promise((resolve) => {
                    var scrollTop = -1;
                    const interval = setInterval(() => {
                      window.scrollBy(0, 100);
                      if(document.documentElement.scrollTop !== scrollTop) {
                        scrollTop = document.documentElement.scrollTop;
                        return;
                      }
                      clearInterval(interval);
                      resolve();
                    }, 200);
                }));
            }
            await page.waitForSelector('body');
            const allHrefs = await page.evaluate((websiteUrl) => {
                let selector = 'a[href^="https://'+websiteUrl+'/"], a[href^="/"]';
                console.log(selector);
                return Array.from(document.querySelectorAll(`${selector}`),link => {
                    if(link.href.match(/(?!.+\.pdf$).+$/)) return link.href
                })
            },websiteUrl);
            const allDataUrls = await page.evaluate((websiteUrl) => {
                return Array.from(document.querySelectorAll('[data-url]'), element =>{
                        const dataUrl = element.getAttribute('data-url');
                            if(dataUrl.includes(websiteUrl) && !dataUrl.startsWith('#') && !dataUrl.startsWith('mailto') && !dataUrl.includes('linkedin.com') && !dataUrl.includes('facebook.com') && !dataUrl.includes('twitter.com') && !dataUrl.includes('plus.google.com') && !dataUrl.includes('.pdf')){
                                return dataUrl;
                            } else {
                                return ;
                            } 
                    })    
            },websiteUrl);
            urlList = mergeArrays(urlList,allHrefs,allDataUrls);
            urlTestedList.push(url)
            console.log('Liste url : '+urlList.length)
            console.log('Liste url finale : '+urlTestedList.length)

            await page.close();
            return getAllUrl(browser, websiteUrl, urlList, arrayCssUsed, arrayCssUnused);
        }else{
            return getAllUrl(browser, websiteUrl, urlList, arrayCssUsed, arrayCssUnused);
        }
    } else {
        console.log("scrap terminé")
        return [urlTestedList, arrayCssUsed, arrayCssUnused];
    }
}

//Analyse des images

const crawlImg = async (browser, urlTestedList, imgList) => {
    
    if(urlTestedList.length > 0){
        let page = await browser.newPage();
        const url = urlTestedList.shift();
        if(url){
            try {
                await page.goto(url);
            } catch (err) {
                console.error(err.message);
                return crawlImg(browser, urlTestedList, imgList);
            }
            //Récupération des images
            const imgSrcs = await page.evaluate(() => {
                //Récupération des balises img
                const allImages = document.querySelectorAll("img")
                let tempArray = [];
                allImages && allImages.forEach(img => {
                    if(img.getAttribute("src") && !(img.getAttribute("src")).includes('svg') && !(img.getAttribute("src")).includes('.bing') && !tempArray.includes(img.getAttribute("src"))){
                        tempArray.push(img.getAttribute("src"))

                    }
                })
                //Récupération des bg-image
                const regex = /background-image.+?\((.+?)\)/gi;
                const allBgImages = document.body.innerHTML.match(regex)
                console.log(allBgImages)
                allBgImages && allBgImages.map(function(e){
                    if(!tempArray.includes(((e.match(/background-image.+?\((.+?)\)/i) ||[])[1] || '').replace(/&quot;|"/g,'')) && !(((e.match(/background-image.+?\((.+?)\)/i) ||[])[1] || '').replace(/&quot;|"/g,'')).includes('svg') && !(((e.match(/background-image.+?\((.+?)\)/i) ||[])[1] || '').replace(/&quot;|"/g,'')).includes('.bing')){
                        tempArray.push(((e.match(/background-image.+?\((.+?)\)/i) ||[])[1] || '').replace(/&quot;|"/g,''))
                    }
                });
                return tempArray
            });
            console.log("Page analysée");
            imgSrcs.forEach(img =>{
                console.log(img)
                if(!imgList.includes(img)){
                    imgList.push(img)
                }
            })
            console.log('nombre images : '+imgList.length)
            await page.close();
            return crawlImg(browser, urlTestedList, imgList);
        }else{
            return crawlImg(browser, urlTestedList, imgList);
        }
    } else {
        console.log("scrap des images terminé")
        console.log(imgList)
        return [imgList];
    }
}
//-------------------------------------------------------------------------------------------------//
//------------------------------------Analyse du CSS-----------------------------------------------//
//-------------------------------------------------------------------------------------------------//

const getAllStylesheets = async(browser, urlList, stylesUrl, stylesContent) => {
    let newUrlList = [...urlList];
    if(newUrlList.length > 0){
        let page = await browser.newPage();
        // await page.setDefaultNavigationTimeout(0);
        const url = newUrlList.shift();
        page.on('response',async response => {
            if(response.request().resourceType() === 'stylesheet') {
                //TODO trycatch par ici je crois ?
                try {
                    const styleContent = await response.text();
                    stylesContent += styleContent;

                    const url = await response.url();
                    if(!stylesUrl.includes(url)) stylesUrl.push(url);
                } catch (error){
                    console.log('Erreur de lecture de : '+ url);
                    console.log(error);
                }   
            }
        });
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            console.log('Check de la page : '+url);
            return getAllStylesheets(browser, newUrlList, stylesUrl, stylesContent);
        } catch (err) {
            console.error(err.message);
            return getAllStylesheets(browser, newUrlList, stylesUrl, stylesContent);
        }
    } else {
        return [stylesUrl, stylesContent];
    }
}

const verifyCss = async (browser, urlList, stylesContent, arrayCssUnused = [], arrayCssUsed = []) => {
    let newUrlList = [...urlList];
    if(newUrlList.length > 0){
        const cssUsed = stylesContent.match(/\.-?[_a-zA-Z]+[_a-zA-Z0-9-]*\s*\{/gm);
            if(cssUsed != null || cssUsed != undefined){
                let page = await browser.newPage();
                // await page.setDefaultNavigationTimeout(0);
                const url = newUrlList.shift();
                console.log('Analyse CSS pour '+url);
                const cssUsedCleaned = cssUsed.map(className => className.replace(/{/,'').replace(' ',''));
                try {
                    await page.goto(url);
                } catch(e){
                    console.log('A');
                    console.log(e);
                }

                try {
                    await page.waitForSelector('body');
                } catch(e){
                    console.log('B');
                    console.log(e);
                }

                try {
                    const tests = await page.evaluate(elementsPassed => {
                        let arrayCssUsedTemp = elementsPassed[1];
                        let arrayCssUnusedTemp = elementsPassed[2];
                        elementsPassed[0].forEach( selector => {
                            const isPresent = [...document.querySelectorAll(selector)];
                            if(isPresent != undefined && isPresent.length > 0){
                                arrayCssUsedTemp.push(selector);
                                const index = arrayCssUnusedTemp.indexOf(selector);
                                if (index > -1) {
                                    arrayCssUnusedTemp.splice(index, 1);
                                }
                            } else {
                                if(!arrayCssUnusedTemp.includes(selector)){
                                    arrayCssUnusedTemp.push(selector);
                                } 
                            }
                        });
                        return [arrayCssUsedTemp, arrayCssUnusedTemp];
                    }, [cssUsedCleaned, arrayCssUsed, arrayCssUnused]);
      
                    arrayCssUsed = [...new Set([...arrayCssUsed,...tests[0]])];
                    arrayCssUnused = [...new Set([...arrayCssUnused,...tests[1]])];
                } catch (e){
                    console.log('C');
                    console.log(e);
                }
                 
                try {
                    await page.close();
                } catch(e){
                    console.log('D');
                    console.log(e);
                }
                
            } 
        console.log(arrayCssUnused)
        console.log(arrayCssUsed)
        return verifyCss(browser, newUrlList, stylesContent, arrayCssUnused, arrayCssUsed)
    } else {
        return [arrayCssUnused, arrayCssUsed];
    }
}

const checkCss = async (page, arrayCssUsed, arrayCssUnused, styles) => {
    styles.forEach(async function(styleOfCss) {
            const cssUsed = styleOfCss.match(/\.-?[_a-zA-Z]+[_a-zA-Z0-9-]*\s*\{/gm);
            if(cssUsed != null || cssUsed != undefined){
                let tempClassChecked = [];
                cssUsed.forEach(async function(cssClassName){
                    const classNamePurified = cssClassName.replace(/{/,'');
                    if(arrayCssUsed.includes(classNamePurified) || tempClassChecked.includes(classNamePurified)){
                    } else {
                        tempClassChecked.push(classNamePurified);
                        try {
                            const tests = await page.evaluate(selector =>{
                                return [...document.querySelectorAll(selector)];
                            }, classNamePurified);
                            if(tests != undefined && tests.length > 0){
                                arrayCssUsed.push(classNamePurified);
                                const index = arrayCssUnused.indexOf(classNamePurified);
                                if (index > -1) {
                                    arrayCssUnused.splice(index, 1);
                                }
                            } else {
                                if(arrayCssUnused.includes(classNamePurified)){
                                } else {
                                    arrayCssUnused.push(classNamePurified);
                                }
                            }
                        } catch(error){
                            console.log(error);
                        }
                    }
                });
            }
    });

}




//-------------------------------------------------------------------------------------------------//


//Fonction principale
const scrap = async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--shm-size=3gb'] });
    let pages = [];
    let images = [];
    let verifiedCss =[];
    let stylesUrl = [];
    let stylesContent = '';
    let arrayCssUsed = [];
    let arrayCssUnused = [];
    let styles = [];
    let urlListTemp = [];

    //Créé un dossier
    if (!fs.existsSync(websiteUrl)) {
        fs.mkdirSync(websiteUrl);
    }
    //Pour éviter le crawl des urls si la liste existe déja
    if (!fs.existsSync(websiteUrl+"/urlList.txt") || (fs.existsSync(websiteUrl+"/urlList.txt") && forceCheckUrl === 'oui' || task === "pages")) {
        //Récupère les urls
        pages = await getAllUrl(browser, websiteUrl, urlList, arrayCssUsed, arrayCssUnused);
        console.log('Récupération des urls des pages terminée');
        //Write url list to file
        fs.writeFile(websiteUrl+"/urlList.txt", JSON.stringify(pages[0]), "utf-8", (err) => {
            if (err) console.log(err);
            else console.log("Url list saved");
        });
        urlListTemp.push(...pages[0]);
    }else{
        const fileContent = fs.readFileSync(websiteUrl+"/urlList.txt");
        urlListTemp = JSON.parse(fileContent);
    }

    //Lancement du script choisi
    if(task === 'img' || task === 'all'){
        images = await crawlImg(browser, pages[0], imgList)
        console.log(images.length)
        console.log(images)
    }
    
    if(task === 'css' || task === 'all'){
        urlListTemp.forEach(async(url) => {
            let page = await browser.newPage();
            page.on('response',async response => {
                if(response.request().resourceType() === 'stylesheet') {
                    //TODO trycatch par ici je crois ?
                    const url = await response.url();
                    try {
                        const styleContent = await response.text();
                        styles.push(styleContent);
                    } catch (error){
                        console.log('Erreur de lecture de : '+ url);
                    }
                    
                }
            });
            await page.goto(url);
            await page.waitForSelector('body');
            await checkCss(page, arrayCssUsed, arrayCssUnused, styles);
        })
        const stylesheets = await getAllStylesheets(browser,urlListTemp, stylesUrl, stylesContent);
        console.log('Récupération des stylesheets terminée.');
        console.log('Début du traitement du style...');
        verifiedCss = await verifyCss(browser, urlListTemp, stylesheets[1]);
        console.log('Fin du traitement du style.');
    }

    browser.close();
    return [images, verifiedCss];
}

scrap()
  .then(value => {
        console.log('Script terminé.');
        console.log(value)

        if (task === 'pages') return

        //Write img list to csv
        fs.writeFile(websiteUrl+"/imgList.txt", JSON.stringify(value[0]), "utf-8", (err) => {
            if (err) console.log(err);
            else console.log("img list saved");
        });
        //Write classUsed list to csv
        fs.writeFile(websiteUrl+"/classUsedList.txt", JSON.stringify(value[1][1]), "utf-8", (err) => {
            if (err) console.log(err);
            else console.log("classUsed list saved");
        });
        //Write classNotUsed list to csv
        let notUsed = value[1][0].filter(el => !value[1][1].includes(el));
        fs.writeFile(websiteUrl+"/classNotUsedList.txt", JSON.stringify(notUsed), "utf-8", (err) => {
            if (err) console.log(err);
            else console.log("classNotUsed list saved");
        });

  })
  .catch(e => console.log(`error: ${e}`))

