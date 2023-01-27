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

const urlList = [];
const urlTestedList = [];
const imgList = [];

//Récupération des infos en console
while(websiteUrl === ""){
    websiteUrl = prompt('URL du site à vérifier ? (sans http/s) : ');
  }
while(task === ""){
  task = prompt('Element à vérifier ? img/css : ');
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

const getAllUrl = async (browser, websiteUrl, urlList) => {
    if(urlList.length > 0){
        let page = await browser.newPage();
        await page.setDefaultNavigationTimeout(0); 
        const url = urlList.shift();
        if(url){
            if(urlTestedList.includes(url)){
                return getAllUrl(browser, websiteUrl, urlList);
            }
            console.log('Check de l\'url : '+url);
            try {
                await page.goto(url);
            } catch (err) {
                console.error(err.message);
                return getAllUrl(browser, websiteUrl, urlList);
            }
            //Gestion de la page actu avec infinite scroll
            if(url == `https://${websiteUrl}/actualites/`){
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
                console.log("a")
                let selector = 'a[href^="https://'+websiteUrl+'/"], a[href^="/"]';
                console.log(selector);
                return [...document.querySelectorAll(`${selector}`)].map(link => {
                    console.log("c")
                    if(link.href.match(/(?!.+\.pdf$).+$/)) link.href
                })
            },websiteUrl);
            const allDataUrls = await page.evaluate((websiteUrl) => {
                return [...document.querySelectorAll('[data-url]')].map(function(element){
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
            return getAllUrl(browser, websiteUrl, urlList);
        }else{
            return getAllUrl(browser, websiteUrl, urlList);
        }
    } else {
        console.log("scrap terminé")
        return [urlTestedList];
    }
}

//Analyse des images



//Analyse du CSS



//Fonction principale
const scrap = async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--shm-size=3gb'] });

    //Lancement du script choisi
    // ...............
    //.........

    //Récupération URL
    const pages = await getAllUrl(browser, websiteUrl, urlList);
    console.log('Récupération des urls des pages terminée');
    console.log(pages.length)
    browser.close();
    return pages;
}

scrap()
  .then(value => {
        console.log('Script terminé.');
        console.log(value)
        //Write to csv
        fs.writeFile("urlList.txt", JSON.stringify(value), "utf-8", (err) => {
            if (err) console.log(err);
            else console.log("Url list saved");
        });


  })
  .catch(e => console.log(`error: ${e}`))

